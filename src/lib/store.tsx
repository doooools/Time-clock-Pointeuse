import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeDaysFromGroups, groupByDay, type DayMark, type DayResult, type Punch } from "../../shared/compute";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";
import { dayKey, formatClock, parseDayKey } from "../../shared/time";
import { tr, useLocale } from "../i18n";
import { api, UnauthorizedError, type MarkInput, type SettingsPatch, type User } from "./api";
import { useToast } from "./toast";

/** Clock that refreshes every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
}

type Store = {
  loading: boolean;
  /** Signed-in account. */
  user: User;
  punches: Punch[];
  marks: DayMark[];
  /** Resolved settings (instance defaults + account values). */
  settings: Settings;
  /** Punches grouped by local day in `settings.timezone`. */
  byDay: Map<string, Punch[]>;
  /** Computed days (refreshed every 30 s). */
  days: DayResult[];
  refresh: () => Promise<void>;
  punchNow: () => Promise<void>;
  addPunch: (ts: number) => Promise<void>;
  updatePunch: (id: number, ts: number) => Promise<void>;
  deletePunch: (p: Punch) => Promise<void>;
  setMark: (date: string, mark: MarkInput) => Promise<void>;
  clearMark: (date: string) => Promise<void>;
  bulkImport: (timestamps: number[]) => Promise<{ inserted: number; skipped: number }>;
  /** Saves account settings; `null` on a key reverts it to the instance default. */
  saveSettings: (patch: SettingsPatch, opts?: { quiet?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  children,
  user: initialUser,
  onUnauthorized,
}: {
  children: ReactNode;
  /** Account from `/api/me`, replaced by the one of `/api/data` once loaded. */
  user: User;
  onUnauthorized: () => void;
}) {
  const toast = useToast();
  const { setLocale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User>(initialUser);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [marks, setMarks] = useState<DayMark[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const minuteNow = useNow(30_000);

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof UnauthorizedError) onUnauthorized();
        else toast(e instanceof Error ? e.message : tr("common.error"), { tone: "error" });
        throw e;
      }
    },
    [onUnauthorized, toast],
  );

  const refresh = useCallback(async () => {
    const data = await guard(api.data);
    setPunches(data.punches);
    setMarks(data.marks);
    setSettings(data.settings);
    if (data.user) setUser(data.user);
    setLoading(false);
  }, [guard]);

  useEffect(() => {
    refresh().catch(() => {});
    // Reload when the user comes back to the app (e.g. after an NFC punch).
    const onVisible = () => document.visibilityState === "visible" && refresh().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // The account language drives the UI; it is also remembered on this device for the login screen.
  useEffect(() => {
    if (!loading) setLocale(settings.locale);
  }, [loading, settings.locale, setLocale]);

  const tz = settings.timezone;
  const byDay = useMemo(() => groupByDay(punches, tz), [punches, tz]);
  const days = useMemo(
    () => computeDaysFromGroups(byDay, marks, settings, minuteNow),
    [byDay, marks, settings, minuteNow],
  );

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      const r = await guard(fn);
      await refresh();
      return r;
    },
    [guard, refresh],
  );

  const deletePunch = useCallback(
    async (p: Punch) => {
      await mutate(() => api.deletePunch(p.id));
      const { d, m } = parseDayKey(dayKey(p.ts, tz));
      const date = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
      toast(tr("common.punchDeleted", { time: formatClock(p.ts, tz), date }), {
        action: {
          label: tr("common.undo"),
          onClick: () =>
            mutate(() => api.restorePunch(p.id))
              .then(() => toast(tr("common.punchRestored", { time: formatClock(p.ts, tz) })))
              .catch(() => {}),
        },
      });
    },
    [mutate, toast, tz],
  );

  const store: Store = {
    loading,
    user,
    punches,
    marks,
    settings,
    byDay,
    days,
    refresh,
    punchNow: async () => {
      const p = await mutate(() => api.addPunch(Date.now()));
      toast(tr("common.punchSaved", { time: formatClock(p.ts, tz) }), {
        action: { label: tr("common.undo"), onClick: () => mutate(() => api.deletePunch(p.id)).catch(() => {}) },
      });
    },
    addPunch: async (ts) => {
      await mutate(() => api.addPunch(ts));
      toast(tr("common.punchAdded", { time: formatClock(ts, tz) }));
    },
    updatePunch: async (id, ts) => {
      await mutate(() => api.updatePunch(id, { ts }));
    },
    deletePunch,
    setMark: async (date, mark) => {
      // The server rejects `half` on a full day.
      const body: MarkInput = { ...mark, half: mark.portion < 1 ? (mark.half ?? null) : null };
      await mutate(() => api.setMark(date, body));
    },
    clearMark: async (date) => {
      await mutate(() => api.clearMark(date));
    },
    bulkImport: (timestamps) => mutate(() => api.bulkImport(timestamps)),
    saveSettings: async (patch, opts) => {
      const r = await guard(() => api.saveSettings(patch));
      setSettings(r.settings);
      if (!opts?.quiet) toast(tr("common.settingsSaved"));
    },
    logout: async () => {
      await api.logout().catch(() => {});
      onUnauthorized();
    },
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

/** Time zone of the signed-in account (`settings.timezone`). */
export function useTz(): string {
  return useStore().settings.timezone;
}

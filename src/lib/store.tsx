import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  computeDaysFromGroups,
  DEFAULT_SETTINGS,
  groupByDay,
  type DayMark,
  type DayResult,
  type MarkType,
  type Punch,
  type Settings,
} from "../../shared/compute";
import { dayKey, formatClock, parseDayKey } from "../../shared/time";
import { tr } from "../i18n";
import { api, UnauthorizedError } from "./api";
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
  /** Read-only session: no changes possible. */
  readOnly: boolean;
  punches: Punch[];
  marks: DayMark[];
  settings: Settings;
  byDay: Map<string, Punch[]>;
  /** Computed days (refreshed every minute). */
  days: DayResult[];
  refresh: () => Promise<void>;
  punchNow: () => Promise<void>;
  addPunch: (ts: number) => Promise<void>;
  updatePunch: (id: number, ts: number) => Promise<void>;
  deletePunch: (p: Punch) => Promise<void>;
  setMark: (date: string, type: MarkType, portion: number, note?: string) => Promise<void>;
  clearMark: (date: string) => Promise<void>;
  bulkImport: (timestamps: number[]) => Promise<{ inserted: number; skipped: number }>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  children,
  onUnauthorized,
  readOnly,
}: {
  children: ReactNode;
  onUnauthorized: () => void;
  readOnly: boolean;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
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
    setLoading(false);
  }, [guard]);

  useEffect(() => {
    refresh().catch(() => {});
    // Reload when the user comes back to the app (e.g. after an NFC punch).
    const onVisible = () => document.visibilityState === "visible" && refresh().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const byDay = useMemo(() => groupByDay(punches), [punches]);
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
      const { d, m } = parseDayKey(dayKey(p.ts));
      toast(tr("common.punchDeleted", { time: formatClock(p.ts), date: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}` }), {
        action: {
          label: tr("common.undo"),
          onClick: () =>
            mutate(() => api.restorePunch(p.id))
              .then(() => toast(tr("common.punchRestored", { time: formatClock(p.ts) })))
              .catch(() => {}),
        },
      });
    },
    [mutate, toast],
  );

  const store: Store = {
    loading,
    readOnly,
    punches,
    marks,
    settings,
    byDay,
    days,
    refresh,
    punchNow: async () => {
      const p = await mutate(() => api.addPunch(Date.now()));
      toast(tr("common.punchSaved", { time: formatClock(p.ts) }), {
        action: { label: tr("common.undo"), onClick: () => mutate(() => api.deletePunch(p.id)).catch(() => {}) },
      });
    },
    addPunch: async (ts) => {
      await mutate(() => api.addPunch(ts));
      toast(tr("common.punchAdded", { time: formatClock(ts) }));
    },
    updatePunch: async (id, ts) => {
      await mutate(() => api.updatePunch(id, { ts }));
    },
    deletePunch,
    setMark: async (date, type, portion, note) => {
      await mutate(() => api.setMark(date, type, portion, note));
    },
    clearMark: async (date) => {
      await mutate(() => api.clearMark(date));
    },
    bulkImport: (timestamps) => mutate(() => api.bulkImport(timestamps)),
    saveSettings: async (patch) => {
      await mutate(() => api.saveSettings(patch));
      toast(tr("common.settingsSaved"));
    },
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

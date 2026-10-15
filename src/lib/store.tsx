import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeDaysFromGroups, groupByDay, type DayMark, type DayResult, type Punch } from "../../shared/compute";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";
import { dayKey, formatClock, parseDayKey } from "../../shared/time";
import { tr, useLocale } from "../i18n";
import { api, UnauthorizedError, userLabel, type AppData, type BulkResult, type MarkInput, type SettingsPatch, type User } from "./api";
import { useMe } from "./me";
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

/** Whose hours the store holds: mine, or a team member's (`/team/:id/…`). */
export type Subject = { id: number; displayName: string; isMe: boolean };

type Store = {
  loading: boolean;
  /** The data could not be loaded (e.g. a member that does not exist or is not visible). */
  failed: boolean;
  /** Account whose data is loaded (the subject); use `useMe()` for the signed-in account. */
  user: User;
  subject: Subject;
  /** The signed-in account may change this data (`editOwn` for mine, server's `canEdit` for a member). */
  canEdit: boolean;
  /** App path for this subject: `/history` → `/team/7/history` when viewing a member. */
  path: (to: string) => string;
  punches: Punch[];
  marks: DayMark[];
  /** Resolved settings of the subject (instance defaults + account values). */
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
  bulkImport: (timestamps: number[]) => Promise<BulkResult>;
  /** Saves my account settings (not available on a member); `null` on a key reverts it to the instance default. */
  saveSettings: (patch: SettingsPatch, opts?: { quiet?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

/** Base path of a member's views. */
export const teamPath = (id: number, to = "/") => `/team/${id}${to === "/" ? "" : to}`;

export function StoreProvider({
  children,
  subjectId = null,
  onUnauthorized,
}: {
  children: ReactNode;
  /** `null` = my data (`/api/data`), otherwise a team member's (`/api/team/:id/data`). */
  subjectId?: number | null;
  onUnauthorized: () => void;
}) {
  const toast = useToast();
  const me = useMe();
  const { setLocale } = useLocale();
  const isMe = subjectId === null;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [user, setUser] = useState<User>(me);
  const [canEditMember, setCanEditMember] = useState(false);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [marks, setMarks] = useState<DayMark[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const minuteNow = useNow(30_000);
  const dataApi = useMemo(() => api.dataFor(subjectId), [subjectId]);

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
    const data: AppData & { canEdit?: boolean } = await guard(() =>
      subjectId === null ? api.data() : api.teamData(subjectId),
    );
    setPunches(data.punches);
    setMarks(data.marks);
    setSettings(data.settings);
    if (data.user) setUser(data.user);
    setCanEditMember(data.canEdit === true);
    setFailed(false);
    setLoading(false);
  }, [guard, subjectId]);

  useEffect(() => {
    refresh().catch(() => setFailed(true));
    // Reload when the user comes back to the app (e.g. after an NFC punch).
    const onVisible = () => document.visibilityState === "visible" && refresh().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // My account language drives the UI (never a member's); it is also remembered on this device for the login screen.
  useEffect(() => {
    if (!loading && isMe) setLocale(settings.locale);
  }, [loading, isMe, settings.locale, setLocale]);

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
      await mutate(() => dataApi.deletePunch(p.id));
      const { d, m } = parseDayKey(dayKey(p.ts, tz));
      const date = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
      toast(tr("common.punchDeleted", { time: formatClock(p.ts, tz), date }), {
        action: {
          label: tr("common.undo"),
          onClick: () =>
            mutate(() => dataApi.restorePunch(p.id))
              .then(() => toast(tr("common.punchRestored", { time: formatClock(p.ts, tz) })))
              .catch(() => {}),
        },
      });
    },
    [dataApi, mutate, toast, tz],
  );

  const subject: Subject = useMemo(
    () => ({ id: isMe ? me.id : (subjectId as number), displayName: userLabel(isMe ? me : user), isMe }),
    [isMe, me, subjectId, user],
  );
  const path = useCallback((to: string) => (subjectId === null ? to : teamPath(subjectId, to)), [subjectId]);

  const store: Store = {
    loading,
    failed,
    user: isMe ? me : user,
    subject,
    canEdit: isMe ? me.capabilities.editOwn : canEditMember,
    path,
    punches,
    marks,
    settings,
    byDay,
    days,
    refresh,
    punchNow: async () => {
      const p = await mutate(() => dataApi.addPunch(Date.now()));
      toast(tr("common.punchSaved", { time: formatClock(p.ts, tz) }), {
        action: { label: tr("common.undo"), onClick: () => mutate(() => dataApi.deletePunch(p.id)).catch(() => {}) },
      });
    },
    addPunch: async (ts) => {
      await mutate(() => dataApi.addPunch(ts));
      toast(tr("common.punchAdded", { time: formatClock(ts, tz) }));
    },
    updatePunch: async (id, ts) => {
      await mutate(() => dataApi.updatePunch(id, { ts }));
    },
    deletePunch,
    setMark: async (date, mark) => {
      // The server rejects `half` on a full day.
      const body: MarkInput = { ...mark, half: mark.portion < 1 ? (mark.half ?? null) : null };
      await mutate(() => dataApi.setMark(date, body));
    },
    clearMark: async (date) => {
      await mutate(() => dataApi.clearMark(date));
    },
    bulkImport: (timestamps) => mutate(() => dataApi.bulkImport(timestamps)),
    saveSettings: async (patch, opts) => {
      if (!isMe) throw new Error("saveSettings is only available on my own data");
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

/** Time zone of the account whose data is shown (`settings.timezone`). */
export function useTz(): string {
  return useStore().settings.timezone;
}

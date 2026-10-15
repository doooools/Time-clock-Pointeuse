// Persistent notifications (C12): changes made to my hours by someone else, or by a member to their own hours
// (for owners and admins). The window only closes with "Got it", which dismisses everything it shows.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dayKey, formatClock, monthKey } from "../../shared/time";
import { useLocale, useT } from "../i18n";
import { api, UnauthorizedError, type NotificationView } from "../lib/api";
import { describeChange } from "../lib/audit";
import { dayLabel } from "../lib/dates";
import { useMe } from "../lib/me";
import { useModal } from "../lib/modal";
import { teamPath, useTz } from "../lib/store";
import { useToast } from "../lib/toast";

const POLL_MS = 60_000;

/** Merges a fresh server list into the shown one: nothing shown disappears before "Got it". */
function merge(shown: NotificationView[], fresh: NotificationView[]): NotificationView[] {
  const ids = new Set(shown.map((n) => n.id));
  const added = fresh.filter((n) => !ids.has(n.id));
  if (!added.length) return shown;
  return [...shown, ...added].sort((a, b) => b.id - a.id);
}

export function NotificationsModal() {
  const [items, setItems] = useState<NotificationView[]>([]);

  const load = useCallback(() => {
    api
      .notifications()
      .then((r) => setItems((shown) => merge(shown, r.notifications)))
      // A failed poll is silent (the next one retries); an expired session is handled by the data store.
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const dismissed = useCallback((ids: number[]) => {
    const gone = new Set(ids);
    setItems((shown) => shown.filter((n) => !gone.has(n.id)));
  }, []);

  if (!items.length) return null;
  return <Dialog items={items} onDismissed={dismissed} />;
}

type Group = { key: string; author: string | null; items: NotificationView[] };

function Dialog({ items, onDismissed }: { items: NotificationView[]; onDismissed: (ids: number[]) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const me = useMe();
  const tz = useTz();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Tab stays inside; Escape does nothing. Declared first: it remembers the element to give focus back to.
  const ref = useModal<HTMLDivElement>(null);
  // Then focus the title, so that screen readers announce the dialog with its heading.
  useEffect(() => titleRef.current?.focus(), []);

  // Grouped by author, in order of their latest change.
  const groups = useMemo(() => {
    const byKey = new Map<string, Group>();
    for (const n of items) {
      const key = n.entry.actor ? `u${n.entry.actor.id}` : "cli";
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { key, author: n.entry.actor?.displayName ?? null, items: [] }));
      g.items.push(n);
    }
    return [...byKey.values()];
  }, [items]);

  const acknowledge = async (then?: string) => {
    if (busy) return;
    setBusy(true);
    const ids = items.map((n) => n.id);
    try {
      await api.dismissNotifications(ids);
      onDismissed(ids);
      if (then) navigate(then);
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) toast(e instanceof Error ? e.message : t("common.error"), { tone: "error" });
      setBusy(false);
    }
  };

  /** History of the day concerned, mine or the member's. */
  const dayPath = (subjectId: number, date: string) => {
    const to = `/history?month=${monthKey(date)}&day=${date}`;
    return subjectId === me.id ? to : teamPath(subjectId, to);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-3 pt-12 pb-24 lg:pt-[90px]">
      {/* No click-to-close: only "Got it" closes this window. */}
      <div aria-hidden className="fixed inset-0 bg-black/70" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-title"
        aria-describedby="notif-intro"
        className="paper-card relative flex w-full max-w-[620px] -rotate-[.5deg] flex-col gap-4 px-5 py-6 shadow-modal lg:px-8 lg:py-7"
      >
        <div className="tape left-[60px] w-[120px] -rotate-[4deg] bg-yellow/80" />
        <h2 id="notif-title" ref={titleRef} tabIndex={-1} className="font-display text-[28px] leading-tight outline-none lg:text-[34px]">
          {t("notifications.title")}
        </h2>
        <p id="notif-intro" className="font-label text-sm">
          {t("notifications.intro", { count: items.length })}
        </p>

        <div className="flex max-h-[55dvh] flex-col gap-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`notif-${g.key}`} className="flex flex-col gap-2 border-t-2 border-dashed border-onpaper pt-3">
              <h3 id={`notif-${g.key}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="-rotate-1 bg-yellow px-2 py-0.5 font-display text-lg">{g.author ?? t("notifications.byCli")}</span>
                <span className="font-label text-[13px]">{t("notifications.changes", { count: g.items.length })}</span>
              </h3>
              <ul className="flex flex-col gap-2.5">
                {g.items.map(({ id, entry }) => {
                  const d = describeChange(entry, t, tz);
                  const otherSubject = entry.subject.id !== me.id && entry.subject.id !== entry.actor?.id;
                  const madeOn = dayKey(entry.at, tz);
                  return (
                    <li key={id} className="flex flex-col gap-0.5 text-base">
                      <div>
                        <b>{d.title}</b>
                        {otherSubject && <span className="font-label text-sm"> · {t("notifications.onHoursOf", { name: entry.subject.displayName })}</span>}
                      </div>
                      {d.lines.map((line, i) => (
                        <div key={i} className="text-sm">
                          {line}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-baseline gap-x-3 font-label text-[13px] text-onpaper-muted">
                        <span>{t("notifications.madeAt", { date: dayLabel(locale, madeOn), time: formatClock(entry.at, tz) })}</span>
                        {d.date && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={t("notifications.openDayAria", { date: dayLabel(locale, d.date) })}
                            className="cursor-pointer text-onpaper underline decoration-dotted underline-offset-4 hover:no-underline disabled:cursor-default"
                            onClick={() => acknowledge(dayPath(entry.subject.id, d.date!))}
                          >
                            {t("notifications.openDay")}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-sm text-onpaper-muted">{t("notifications.keepOpen")}</p>
        <div className="flex justify-end">
          <button type="button" className="btn-ink px-[18px] py-2.5" disabled={busy} onClick={() => acknowledge()}>
            {busy ? t("notifications.dismissing") : t("notifications.understood")}
          </button>
        </div>
      </div>
    </div>
  );
}

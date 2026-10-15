import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cx } from "../components/Widgets";
import { intlTag, useLocale, useT } from "../i18n";
import { api, userLabel, type AuditEntryView, type TeamMember } from "../lib/api";
import { describeChange } from "../lib/audit";
import { useMe } from "../lib/me";
import { teamPath, useTz } from "../lib/store";

const PAGE_SIZE = 50;
/** Filter value: my own data (default), or everyone I may see. */
type Filter = "mine" | "all" | number;

export default function Journal() {
  const t = useT();
  const { locale } = useLocale();
  const me = useMe();
  const tz = useTz();
  const canPickMember = me.capabilities.viewTeam;
  const [params] = useSearchParams();
  const initialId = Number(params.get("userId"));
  const [filter, setFilter] = useState<Filter>(canPickMember && Number.isInteger(initialId) && initialId > 0 && initialId !== me.id ? initialId : "mine");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!canPickMember) return;
    api
      .team()
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, [canPickMember]);

  const userId = filter === "mine" ? me.id : filter === "all" ? undefined : filter;

  const load = useCallback(
    async (before?: number) => {
      try {
        const page = await api.journal({ userId, before, limit: PAGE_SIZE });
        setEntries((prev) => (before !== undefined && prev ? [...prev, ...page.entries] : page.entries));
        setNext(page.next);
        setError(null);
      } catch (e) {
        setError(t("journal.loadError", { message: e instanceof Error ? e.message : String(e) }));
      }
    },
    [userId, t],
  );

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  async function more() {
    if (next === null) return;
    setLoadingMore(true);
    await load(next);
    setLoadingMore(false);
  }

  const when = useMemo(
    () => new Intl.DateTimeFormat(intlTag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: tz }),
    [locale, tz],
  );

  const dayLink = (entry: AuditEntryView, date: string): string => {
    const to = `/history?month=${date.slice(0, 7)}&day=${date}`;
    return entry.subject.id === me.id ? to : teamPath(entry.subject.id, to);
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="page-title self-start">{t("journal.title")}</h1>
      <p className="max-w-2xl text-pretty text-paper-soft">{t("journal.intro")}</p>

      {canPickMember && (
        <div className="flex max-w-sm flex-col gap-1.5">
          <label htmlFor="journal-filter" className="lbl">
            {t("journal.filterLabel")}
          </label>
          <select
            id="journal-filter"
            className="field"
            value={String(filter)}
            onChange={(e) => {
              const v = e.target.value;
              setFilter(v === "mine" || v === "all" ? v : Number(v));
            }}
          >
            <option value="mine">{t("journal.filterMine")}</option>
            <option value="all">{t("journal.filterAll")}</option>
            {members
              .filter((m) => m.id !== me.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {userLabel(m)}
                </option>
              ))}
          </select>
        </div>
      )}

      {error && (
        <div role="alert" className="text-[13px] text-red-text">
          {error}
        </div>
      )}
      {entries === null && !error && <p className="text-paper-muted">{t("journal.loading")}</p>}

      {entries && entries.length === 0 && (
        <div className="flex max-w-xl flex-col gap-1 border-2 border-dashed border-paper-dim px-5 py-6">
          <div className="font-display text-3xl leading-none text-yellow">{t("journal.empty")}</div>
          <p className="text-paper-soft">{t("journal.emptyHint")}</p>
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="flex flex-col">
          {entries.map((entry) => {
            const d = describeChange(entry, t, tz);
            const actor = entry.actor ? userLabel(entry.actor) : t("journal.byCli");
            const otherAccount = entry.subject.id !== me.id;
            return (
              <li key={entry.id} className="flex flex-col gap-1 border-b border-line px-1 py-3 sm:flex-row sm:gap-5">
                <time dateTime={new Date(entry.at).toISOString()} className="shrink-0 font-label text-[14px] text-paper-muted sm:w-44">
                  {when.format(entry.at)}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="text-pretty">
                    <span className="font-label text-lg text-yellow">{actor}</span> {d.title}
                    {otherAccount && (
                      <span className="text-paper-muted"> · {t("journal.onAccount", { name: entry.subject.displayName })}</span>
                    )}
                  </div>
                  {d.lines.length > 0 && (
                    <ul className={cx("mt-0.5 text-[14px] text-paper-soft")}>
                      {d.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                  {d.date && (
                    <Link to={dayLink(entry, d.date)} className="mt-0.5 inline-block text-[14px] text-paper-muted underline hover:text-yellow">
                      {t("journal.viewDay")}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {next !== null && (
        <button type="button" className="btn-secondary self-start px-4 py-2" disabled={loadingMore} onClick={() => void more()}>
          {t("journal.loadMore")}
        </button>
      )}
    </div>
  );
}

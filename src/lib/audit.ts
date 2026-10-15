// Plain-language description of an audit-log entry (contract C10/C12), shared by the notifications window
// and the journal page. The author is shown separately, so the title is a verb phrase ("added a punch at…").
import type { TFn, TKey } from "../i18n";
import type { AuditAction, AuditEntryView } from "./api";
import { dayKey, formatClock } from "../../shared/time";
import { shortDate } from "./dates";

export type { AuditAction, AuditEntryView };

export type ChangeDescription = {
  title: string;
  /** Detail lines under the title (may be empty). */
  lines: string[];
  /** Day concerned (YYYY-MM-DD) when the change targets one, for a link to that day. */
  date?: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const MARK_KEYS = {
  leave: "journal.markLeave",
  sick: "journal.markSick",
  holiday: "journal.markHoliday",
  comp_time: "journal.markCompTime",
  workday: "journal.markWorkday",
} as const satisfies Record<string, TKey>;

const ROLE_KEYS = {
  owner: "journal.roleOwner",
  admin: "journal.roleAdmin",
  user: "journal.roleUser",
} as const satisfies Record<string, TKey>;

const FIELD_KEYS = {
  role: "journal.fieldRole",
  displayName: "journal.fieldDisplayName",
  disabled: "journal.fieldDisabled",
  settings: "journal.fieldSettings",
  editOwn: "journal.fieldEditOwn",
  viewPresence: "journal.fieldViewPresence",
  viewTeam: "journal.fieldViewTeam",
} as const satisfies Record<string, TKey>;

function role(t: TFn, v: unknown): string {
  return typeof v === "string" && v in ROLE_KEYS ? t(ROLE_KEYS[v as keyof typeof ROLE_KEYS]) : String(v ?? "");
}

/** Display of one value of a `user.update` diff. */
function plain(t: TFn, field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return t("journal.none");
  if (field === "role") return role(t, v);
  if (typeof v === "boolean") return t(v ? "journal.yes" : "journal.no");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function punchParts(side: unknown, tz: string) {
  const ts = num(obj(side).ts);
  return ts === null ? null : { time: formatClock(ts, tz), day: dayKey(ts, tz), note: str(obj(side).note) };
}

function describePunch(e: AuditEntryView, t: TFn, tz: string): ChangeDescription {
  const before = punchParts(e.before, tz);
  const after = punchParts(e.after, tz);
  // The punch the entry is about: the new state, otherwise the previous one.
  const main = after ?? before;
  const time = main?.time ?? "?";
  const day = main?.day;
  const date = day ? shortDate(day) : "";
  const lines: string[] = [];
  const note = (p: typeof main) => p?.note ?? null;

  switch (e.action) {
    case "punch.create":
      if (note(after)) lines.push(t("journal.lineNote", { note: note(after)! }));
      return { title: t("journal.punchCreate", { time, date }), lines, date: day };
    case "punch.delete":
      if (note(before)) lines.push(t("journal.lineNote", { note: note(before)! }));
      return { title: t("journal.punchDelete", { time: before?.time ?? time, date }), lines, date: day };
    case "punch.restore":
      return { title: t("journal.punchRestore", { time, date }), lines, date: day };
    default: {
      // punch.update
      const noteBefore = note(before);
      const noteAfter = note(after);
      if (noteBefore !== noteAfter) {
        if (!noteBefore) lines.push(t("journal.lineNoteAdded", { note: noteAfter! }));
        else if (!noteAfter) lines.push(t("journal.lineNoteRemoved"));
        else lines.push(t("journal.lineNoteChanged", { from: noteBefore, to: noteAfter }));
      }
      if (before && after && before.time !== after.time) {
        return { title: t("journal.punchUpdateMoved", { from: before.time, to: after.time, date }), lines, date: day };
      }
      const title = lines.length ? t("journal.punchUpdateNote", { time, date }) : t("journal.punchUpdate", { time, date });
      return { title, lines, date: day };
    }
  }
}

function describeMark(e: AuditEntryView, t: TFn): ChangeDescription {
  const date = typeof e.target === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.target) ? e.target : undefined;
  const day = date ? shortDate(date) : "";
  if (e.action === "mark.clear") return { title: t("journal.markClear", { date: day }), lines: [], date };
  const after = obj(e.after);
  const type = typeof after.type === "string" && after.type in MARK_KEYS ? t(MARK_KEYS[after.type as keyof typeof MARK_KEYS]) : "?";
  const half = after.half === "am" ? t("journal.halfAm") : after.half === "pm" ? t("journal.halfPm") : null;
  const lines: string[] = [];
  const portion = num(after.portion);
  if (portion !== null && portion < 1 && !half) lines.push(t("journal.linePortion", { portion: Math.round(portion * 100) }));
  const note = str(after.note);
  if (note) lines.push(t("journal.lineNote", { note }));
  const title = half ? t("journal.markSetHalf", { type, half, date: day }) : t("journal.markSet", { type, date: day });
  return { title, lines, date };
}

const RIGHTS = ["editOwn", "viewPresence", "viewTeam"];

/** `user.update` diff with the nested `permissions` object flattened (the flat form is accepted too). */
function flatten(side: unknown): Obj {
  const { permissions, ...rest } = obj(side);
  return { ...rest, ...obj(permissions) };
}

function describeUser(e: AuditEntryView, t: TFn, viewerId?: number | null): ChangeDescription {
  const lines: string[] = [];
  // Wording depends on the reader: "your password" for the account concerned, "X's password" otherwise.
  const mine = viewerId != null && e.subject.id === viewerId;
  const name = e.subject.displayName;
  switch (e.action) {
    case "user.create": {
      const after = obj(e.after);
      const username = str(after.username);
      if (username) lines.push(t("journal.lineUsername", { username }));
      if (after.role !== undefined) lines.push(t("journal.lineRole", { role: role(t, after.role) }));
      return { title: t("journal.userCreate"), lines };
    }
    case "user.token":
      if (mine) lines.push(t("journal.lineTokenReminder"));
      return { title: mine ? t("journal.userToken") : t("journal.userTokenOther", { name }), lines };
    case "user.unlock":
      return { title: t("journal.userUnlock"), lines };
    case "user.delete":
      return { title: t("journal.userDelete"), lines };
    default: {
      const before = flatten(e.before);
      const after = flatten(e.after);
      for (const field of Object.keys(after)) {
        if (field === "password") {
          lines.push(t("journal.linePasswordReset"));
          continue;
        }
        const label = field in FIELD_KEYS ? t(FIELD_KEYS[field as keyof typeof FIELD_KEYS]) : field;
        if (field in before) lines.push(t("journal.lineField", { field: label, from: plain(t, field, before[field]), to: plain(t, field, after[field]) }));
        else lines.push(t("journal.lineFieldSet", { field: label, to: plain(t, field, after[field]) }));
      }
      const keys = Object.keys(after);
      const rights = keys.filter((k) => RIGHTS.includes(k));
      let title = t("journal.userUpdate");
      if (keys.length === 1 && keys[0] === "password") title = mine ? t("journal.userPassword") : t("journal.userPasswordOther", { name });
      else if (keys.length === 1 && keys[0] === "role") {
        title = mine ? t("journal.userRole", { role: role(t, after.role) }) : t("journal.userRoleOther", { name, role: role(t, after.role) });
      } else if (rights.length && rights.length === keys.length) title = mine ? t("journal.userRights") : t("journal.userRightsOther", { name });
      return { title, lines };
    }
  }
}

/** Author shown for an entry: the account, "command line", or "deleted account" (no actor but a web change). */
export function authorLabel(entry: AuditEntryView, t: TFn): string {
  if (entry.actor) return entry.actor.displayName || "";
  return entry.source === "cli" ? t("journal.byCli") : t("journal.byDeleted");
}

/** Describes a change in the language of `t` for the reader `viewerId` (account-level wording); clock times and days are rendered in the time zone `tz` of the data owner. */
export function describeChange(entry: AuditEntryView, t: TFn, tz: string, viewerId?: number | null): ChangeDescription {
  switch (entry.action) {
    case "punch.create":
    case "punch.update":
    case "punch.delete":
    case "punch.restore":
      return describePunch(entry, t, tz);
    case "punch.import": {
      const after = obj(entry.after);
      const inserted = num(after.inserted) ?? 0;
      const skipped = num(after.skipped) ?? 0;
      const from = str(after.from);
      const to = str(after.to);
      const lines: string[] = [];
      if (from && to) lines.push(t("journal.linePeriod", { from: shortDate(from), to: shortDate(to) }));
      if (skipped > 0) lines.push(t("journal.lineSkipped", { count: skipped }));
      return { title: t("journal.punchImport", { count: inserted }), lines, date: from ?? undefined };
    }
    case "mark.set":
    case "mark.clear":
      return describeMark(entry, t);
    case "user.create":
    case "user.update":
    case "user.token":
    case "user.unlock":
    case "user.delete":
      return describeUser(entry, t, viewerId);
    default:
      return { title: t("journal.unknownAction", { action: String((entry as { action: string }).action) }), lines: [] };
  }
}

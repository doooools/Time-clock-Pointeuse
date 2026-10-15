// Typed client for the REST API (contracts C5 and C11). All calls send the session cookie.
import { tr } from "../i18n";
import type { DayMark, MarkType, Punch } from "../../shared/compute";
import type { Settings } from "../../shared/settings";

/** The session is missing or no longer valid (401 on an authenticated route). */
export class UnauthorizedError extends Error {}

/** An error answered by the server, with its HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type RequestOptions = {
  /** When false, a 401 is reported as an ApiError (e.g. wrong password) instead of an expired session. */
  sessionAuth?: boolean;
};

async function request<T>(method: string, url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && opts.sessionAuth !== false) throw new UnauthorizedError();
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? tr("common.errorStatus", { status: res.status });
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** Query string from the defined values only (`?a=1&b=2`, or "" when none). */
function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// --- Accounts, roles and rights (C8) ---

export type Role = "owner" | "admin" | "user";
export const ROLES: Role[] = ["owner", "admin", "user"];

/** Rights stored on an account (meaningful for the `user` role; owners and admins have everything). */
export type Permissions = { editOwn: boolean; viewPresence: boolean; viewTeam: boolean };

/** Effective rights, computed by the server from the role and the permissions. */
export type Capabilities = {
  manageAdmins: boolean;
  manageUsers: boolean;
  editOthers: boolean;
  viewTeam: boolean;
  viewPresence: boolean;
  editOwn: boolean;
};

export type User = { id: number; username: string; displayName: string | null; role: Role };

/** The signed-in account as `/api/me` returns it. */
export type CurrentUser = User & { permissions: Permissions; capabilities: Capabilities };

export type Me =
  | { authenticated: false; defaultLocale?: string }
  | { authenticated: true; user: CurrentUser; /** Resolved account language. */ locale?: string };

/** Name to show for an account: display name, else username. */
export function userLabel(u: { displayName?: string | null; username?: string }): string {
  return u.displayName || u.username || "";
}

// --- Data ---

export type AppData = { punches: Punch[]; marks: DayMark[]; settings: Settings; serverNow: number; user: User };

/** `GET /api/team/:id/data`: same payload, plus whether the caller may correct this account's data. */
export type SubjectData = AppData & { canEdit: boolean };

/** Body of `PUT …/days/:date/mark`. `half` only makes sense when `portion < 1`. */
export type MarkInput = { type: MarkType; portion: number; half?: "am" | "pm" | null; note?: string | null };

export type BulkResult = { inserted: number; skipped: number };

/** `PUT /api/settings` body: a value sets the key for the account, `null` reverts it to the instance default. */
export type SettingsPatch = { [K in keyof Settings]?: Settings[K] | null };

export type SettingsInfo = {
  /** Effective settings (instance defaults + account values). */
  settings: Settings;
  /** Values stored on the account. */
  stored: Partial<Settings>;
  /** Instance defaults, fully resolved (what a key reverts to when set to `null`). */
  defaults: Settings;
  webhookToken: string;
};

/**
 * Punch and mark mutations of one account: mine (`/api/…`) or a team member's (`/api/team/:id/…`).
 * Both sets of routes share the same validation on the server.
 */
export type DataApi = {
  addPunch: (ts: number, note?: string) => Promise<Punch>;
  updatePunch: (id: number, patch: { ts?: number; note?: string | null }) => Promise<Punch>;
  deletePunch: (id: number) => Promise<{ ok: true }>;
  restorePunch: (id: number) => Promise<{ ok: true }>;
  bulkImport: (timestamps: number[]) => Promise<BulkResult>;
  setMark: (date: string, mark: MarkInput) => Promise<{ ok: true }>;
  clearMark: (date: string) => Promise<{ ok: true }>;
};

function dataApi(base: string): DataApi {
  return {
    addPunch: (ts, note) => request("POST", `${base}/punches`, { ts, note }),
    updatePunch: (id, patch) => request("PATCH", `${base}/punches/${id}`, patch),
    deletePunch: (id) => request("DELETE", `${base}/punches/${id}`),
    restorePunch: (id) => request("POST", `${base}/punches/${id}/restore`),
    bulkImport: (timestamps) => request("POST", `${base}/punches/bulk`, { timestamps }),
    setMark: (date, mark) => request("PUT", `${base}/days/${date}/mark`, mark),
    clearMark: (date) => request("DELETE", `${base}/days/${date}/mark`),
  };
}

const ownData = dataApi("/api");

// --- Team, presence (C11) ---

/** `GET /api/team`. A `user` only sees active accounts, without `username` nor `disabled`. */
export type TeamMember = { id: number; displayName: string | null; role: Role; username?: string; disabled?: boolean };

export type PresenceEntry = {
  id: number;
  displayName: string;
  /** Currently punched in (odd number of punches today, in the member's time zone). */
  present: boolean;
  /** Time of the punch that opened the current state, if any (epoch ms). */
  since: number | null;
  lastPunch: number | null;
};

// --- Change log and notifications (C10, C11) ---

export type AuditAction =
  | "punch.create" | "punch.update" | "punch.delete" | "punch.restore" | "punch.import"
  | "mark.set" | "mark.clear"
  | "user.create" | "user.update" | "user.token" | "user.unlock" | "user.delete";

export type AuditEntryView = {
  id: number;
  at: number;
  action: AuditAction;
  /** null = command line (or deleted account). */
  actor: { id: number; displayName: string } | null;
  subject: { id: number; displayName: string };
  /** Punch id or day (YYYY-MM-DD), depending on the action. */
  target: string | null;
  before: unknown;
  after: unknown;
  source: "web" | "cli";
};

export type JournalQuery = { userId?: number; before?: number; limit?: number };
export type JournalPage = { entries: AuditEntryView[]; next: number | null };

export type NotificationView = { id: number; createdAt: number; entry: AuditEntryView };

// --- Admin (C5 + C11) ---

export type AdminUser = User & {
  disabled: boolean;
  createdAt: number;
  locked: boolean;
  lockedUntil: number | null;
  permissions: Permissions;
};

export type NewUserInput = {
  username: string;
  password: string;
  displayName?: string | null;
  role?: Role;
  settings?: SettingsPatch;
  permissions?: Partial<Permissions>;
};

export type UserPatch = {
  displayName?: string | null;
  role?: Role;
  disabled?: boolean;
  password?: string;
  settings?: SettingsPatch;
  permissions?: Partial<Permissions>;
  unlock?: true;
};

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<{ ok: true }>("POST", "/api/login", { username, password }, { sessionAuth: false }),
  logout: () => request<{ ok: true }>("POST", "/api/logout"),

  // My data
  data: () => request<AppData>("GET", "/api/data"),
  ...ownData,
  /** Mutations aimed at my data (`null`) or at a team member's. */
  dataFor: (subjectId: number | null): DataApi => (subjectId === null ? ownData : dataApi(`/api/team/${subjectId}`)),

  // My account
  settings: () => request<SettingsInfo>("GET", "/api/settings"),
  saveSettings: (patch: SettingsPatch) => request<{ settings: Settings }>("PUT", "/api/settings", patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("POST", "/api/me/password", { currentPassword, newPassword }), // wrong current → 400
  regenerateWebhookToken: () => request<{ webhookToken: string }>("POST", "/api/me/webhook-token"),

  // Team
  team: () => request<{ members: TeamMember[] }>("GET", "/api/team"),
  teamData: (id: number) => request<SubjectData>("GET", `/api/team/${id}/data`),
  presence: () => request<{ members: PresenceEntry[] }>("GET", "/api/team/presence"),

  // Change log and notifications
  journal: (q: JournalQuery = {}) => request<JournalPage>("GET", `/api/journal${query(q)}`),
  notifications: () => request<{ notifications: NotificationView[] }>("GET", "/api/notifications"),
  dismissNotifications: (ids: number[]) =>
    request<{ ok: true; dismissed: number }>("POST", "/api/notifications/dismiss", { ids }),

  // Accounts (manageUsers)
  adminUsers: () => request<{ users: AdminUser[] }>("GET", "/api/admin/users"),
  createUser: (input: NewUserInput) =>
    request<{ user: AdminUser; webhookToken: string }>("POST", "/api/admin/users", input),
  updateUser: (id: number, patch: UserPatch) => request<{ user: AdminUser }>("PATCH", `/api/admin/users/${id}`, patch),
  regenerateUserToken: (id: number) => request<{ webhookToken: string }>("POST", `/api/admin/users/${id}/webhook-token`),
  deleteUser: (id: number) => request<{ ok: true }>("DELETE", `/api/admin/users/${id}`),
};

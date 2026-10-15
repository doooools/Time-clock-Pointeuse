// Typed client for the REST API (contract C5). All calls send the session cookie.
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

export type Role = "admin" | "user";
export type User = { id: number; username: string; displayName: string | null; role: Role };

export type Me =
  | { authenticated: false; defaultLocale?: string }
  | { authenticated: true; user: User; /** Resolved account language. */ locale?: string };

export type AppData = { punches: Punch[]; marks: DayMark[]; settings: Settings; serverNow: number; user: User };

/** Body of `PUT /api/days/:date/mark`. `half` only makes sense when `portion < 1`. */
export type MarkInput = { type: MarkType; portion: number; half?: "am" | "pm" | null; note?: string | null };

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

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<{ ok: true }>("POST", "/api/login", { username, password }, { sessionAuth: false }),
  logout: () => request<{ ok: true }>("POST", "/api/logout"),
  data: () => request<AppData>("GET", "/api/data"),
  addPunch: (ts: number, note?: string) => request<Punch>("POST", "/api/punches", { ts, note }),
  updatePunch: (id: number, patch: { ts?: number; note?: string | null }) =>
    request<Punch>("PATCH", `/api/punches/${id}`, patch),
  deletePunch: (id: number) => request<{ ok: true }>("DELETE", `/api/punches/${id}`),
  restorePunch: (id: number) => request<{ ok: true }>("POST", `/api/punches/${id}/restore`),
  bulkImport: (timestamps: number[]) =>
    request<{ inserted: number; skipped: number }>("POST", "/api/punches/bulk", { timestamps }),
  setMark: (date: string, mark: MarkInput) => request<{ ok: true }>("PUT", `/api/days/${date}/mark`, mark),
  clearMark: (date: string) => request<{ ok: true }>("DELETE", `/api/days/${date}/mark`),
  settings: () => request<SettingsInfo>("GET", "/api/settings"),
  saveSettings: (patch: SettingsPatch) => request<{ settings: Settings }>("PUT", "/api/settings", patch),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("POST", "/api/me/password", { currentPassword, newPassword }), // wrong current → 400
  regenerateWebhookToken: () => request<{ webhookToken: string }>("POST", "/api/me/webhook-token"),
};

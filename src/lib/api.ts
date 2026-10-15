import { tr } from "../i18n";
import type { DayMark, MarkType, Punch, Settings } from "../../shared/compute";

export class UnauthorizedError extends Error {}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401) throw new UnauthorizedError();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? tr("common.errorStatus", { status: res.status }));
  return data as T;
}

export type AppData = { punches: Punch[]; marks: DayMark[]; settings: Settings; serverNow: number };

export const api = {
  me: () => request<{ authenticated: boolean; readOnly: boolean }>("GET", "/api/me"),
  loginReadonly: () => request<{ ok: true }>("POST", "/api/login-readonly"),
  login: (password: string) => request<{ ok: true }>("POST", "/api/login", { password }),
  logout: () => request<{ ok: true }>("POST", "/api/logout"),
  data: () => request<AppData>("GET", "/api/data"),
  addPunch: (ts: number, note?: string) => request<Punch>("POST", "/api/punches", { ts, note }),
  updatePunch: (id: number, patch: { ts?: number; note?: string | null }) =>
    request<Punch>("PATCH", `/api/punches/${id}`, patch),
  deletePunch: (id: number) => request<{ ok: true }>("DELETE", `/api/punches/${id}`),
  restorePunch: (id: number) => request<{ ok: true }>("POST", `/api/punches/${id}/restore`),
  bulkImport: (timestamps: number[]) =>
    request<{ inserted: number; skipped: number }>("POST", "/api/punches/bulk", { timestamps }),
  setMark: (date: string, type: MarkType, portion: number, note?: string) =>
    request<{ ok: true }>("PUT", `/api/days/${date}/mark`, { type, portion, note }),
  clearMark: (date: string) => request<{ ok: true }>("DELETE", `/api/days/${date}/mark`),
  settings: () => request<{ settings: Settings; webhookToken: string | null }>("GET", "/api/settings"),
  saveSettings: (patch: Partial<Settings>) => request<{ settings: Settings }>("PUT", "/api/settings", patch),
};

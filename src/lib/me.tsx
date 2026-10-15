// Signed-in account with its effective rights (`/api/me`), available to every page through useMe().
import { createContext, useContext, type ReactNode } from "react";
import type { Capabilities, CurrentUser, Permissions, User } from "./api";

const DEFAULT_PERMISSIONS: Permissions = { editOwn: true, viewPresence: false, viewTeam: false };

/**
 * Fills `permissions` and `capabilities` when the server omits them. The server stays the authority (C8):
 * this fallback only mirrors its rules so the UI never shows less than the account may do.
 */
export function withCapabilities(user: User & Partial<Pick<CurrentUser, "permissions" | "capabilities">>): CurrentUser {
  const permissions = { ...DEFAULT_PERMISSIONS, ...user.permissions };
  const staff = user.role === "owner" || user.role === "admin";
  const capabilities: Capabilities = user.capabilities ?? {
    manageAdmins: user.role === "owner",
    manageUsers: staff,
    editOthers: staff,
    viewTeam: staff || permissions.viewTeam,
    viewPresence: staff || permissions.viewPresence,
    editOwn: staff || permissions.editOwn,
  };
  return { ...user, permissions, capabilities };
}

/** Whether the "Team" entry belongs in the navigation (C12). */
export function showsTeam(c: Capabilities): boolean {
  return c.manageUsers || c.viewTeam || c.viewPresence;
}

type MeCtx = { me: CurrentUser; refreshMe: () => Promise<void> };
const MeContext = createContext<MeCtx | null>(null);

export function MeProvider({ me, refreshMe, children }: MeCtx & { children: ReactNode }) {
  return <MeContext.Provider value={{ me, refreshMe }}>{children}</MeContext.Provider>;
}

function useMeCtx(): MeCtx {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("MeProvider missing");
  return ctx;
}

/** The signed-in account, with `permissions` and `capabilities`. */
export function useMe(): CurrentUser {
  return useMeCtx().me;
}

/** Reloads `/api/me` (e.g. after an admin changed my rights). */
export function useRefreshMe(): () => Promise<void> {
  return useMeCtx().refreshMe;
}

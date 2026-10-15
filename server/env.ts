import type { Locale } from "../shared/settings";
import type { Db } from "./db/types";

/** Runtime bindings. Cloudflare provides them natively; `entry/node.ts` builds them from `process.env`. */
export type Env = {
  DB: Db;
  /** Static front-end (Workers assets binding, or a shim provided by `entry/node.ts`). */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Required, at least 32 characters. The app answers an explicit 500 otherwise. */
  SESSION_SECRET: string;
  /** Instance defaults, applied under each user's own settings (validated by `sanitizeSettings`). */
  DEFAULT_LOCALE?: string;
  DEFAULT_TIMEZONE?: string;
  DEFAULT_HOLIDAYS?: string;
  DEFAULT_DAILY_TARGET_MIN?: string;
};

/** owner = superadmin (manages owners and admins too), admin = manages `user` accounts, user = own data. */
export type Role = "owner" | "admin" | "user";

/** Row of the `users` table. */
export type UserRow = {
  id: number;
  username: string;
  display_name: string | null;
  password_hash: string;
  role: Role;
  /** Permissions of a `user` account (0/1); owners and admins have everything implicitly. */
  perm_edit_own: number;
  perm_view_presence: number;
  perm_view_team: number;
  webhook_token: string;
  settings: string;
  session_version: number;
  created_at: number;
  disabled_at: number | null;
  /** Consecutive failed password checks. */
  failed_logins: number;
  /** Password checks are refused until this epoch ms; null = not locked. */
  locked_until: number | null;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Language of server messages for this request (user's setting once authenticated). */
    locale: Locale;
    /** Authenticated user, set by `requireSession`. */
    user: UserRow;
  };
};

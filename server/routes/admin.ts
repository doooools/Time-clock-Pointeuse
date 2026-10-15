import { Hono, type Context } from "hono";
import { recordChange, type ChangeEntry } from "../audit";
import { requireCapability } from "../auth";
import type { AppEnv, Role, UserRow } from "../env";
import { fail, parseId, readBody } from "../http";
import { hashPassword } from "../passwords";
import {
  adminUserView,
  applySettingsPatch,
  canAssignRole,
  canManageUser,
  createUser,
  DISPLAY_NAME_MAX,
  getUserById,
  isValidUsername,
  listUsers,
  NOT_LAST_ACTIVE_OWNER,
  parsePermissions,
  passwordProblem,
  PASSWORD_MAX,
  PASSWORD_MIN,
  permissions,
  permissionsSql,
  regenerateWebhookToken,
  ROLES,
  storedSettings,
  USERNAME_MAX,
  type Permissions,
} from "../users";

const isDisplayName = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || (typeof v === "string" && v.length <= DISPLAY_NAME_MAX);

/** Normalizes an optional display name: blank strings become null. */
const cleanDisplayName = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** Change log entry by the signed-in user on account `subjectId` (see server/audit.ts). */
const log = (c: Context<AppEnv>, subjectId: number, entry: Omit<ChangeEntry, "actorId" | "subjectId">) =>
  recordChange(c.env.DB, { actorId: c.get("user").id, subjectId, ...entry });

/**
 * The account behind `:id` if the signed-in user may manage it: 404 when unknown, 403 `roleForbidden` for an
 * admin targeting an owner or another admin (only owners manage those).
 */
async function managedTarget(c: Context<AppEnv>): Promise<UserRow | Response> {
  const id = parseId(c.req.param("id"));
  const target = id === null ? null : await getUserById(c.env.DB, id);
  if (!target) return fail(c, 404, "notFound");
  if (!canManageUser(c.get("user"), target)) return fail(c, 403, "roleForbidden");
  return target;
}

/**
 * Account management API (capability `manageUsers`: owners manage every account, admins `user` accounts
 * only). Used by the Team page and scripts; the CLI does the same directly on the database.
 * Mounted under `/api/admin`.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", requireCapability("manageUsers"))

  .get("/users", async (c) => c.json({ users: (await listUsers(c.env.DB)).map((u) => adminUserView(u)) }))

  .post("/users", async (c) => {
    const body = await readBody(c);
    const username = typeof body.username === "string" ? body.username.trim() : body.username;
    if (!isValidUsername(username)) return fail(c, 400, "invalidUsername", { max: USERNAME_MAX });
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
    if (!isDisplayName(body.displayName)) return fail(c, 400, "invalidDisplayName", { max: DISPLAY_NAME_MAX });
    const role = body.role ?? "user";
    if (!ROLES.includes(role as Role)) return fail(c, 400, "invalidRole");
    if (!canAssignRole(c.get("user"), role as Role)) return fail(c, 403, "roleForbidden");
    let perms: Partial<Permissions> = {};
    if (body.permissions !== undefined) {
      const parsed = parsePermissions(body.permissions);
      if (!parsed) return fail(c, 400, "invalidPermissions");
      perms = parsed;
    }
    let settings = {};
    if (body.settings !== undefined) {
      const result = applySettingsPatch({}, body.settings);
      if (!result.ok) return fail(c, 400, "invalidSettings", { keys: result.invalid.join(", ") });
      settings = result.settings;
    }
    const user = await createUser(c.env.DB, {
      username,
      password: body.password as string,
      displayName: cleanDisplayName(body.displayName),
      role: role as Role,
      permissions: perms,
      settings,
    });
    if (!user) return fail(c, 409, "usernameTaken");
    await log(c, user.id, {
      action: "user.create",
      after: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        permissions: permissions(user),
        settings: storedSettings(user),
      },
    });
    return c.json({ user: adminUserView(user), webhookToken: user.webhook_token }, 201);
  })

  .patch("/users/:id", async (c) => {
    const target = await managedTarget(c);
    if (target instanceof Response) return target;
    const body = await readBody(c);

    const sets: string[] = [];
    const values: unknown[] = [];
    // Changed fields for the change log (never the password itself).
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let revokeSessions = false;
    let unlock = false;
    let guardOwner = false;

    if (body.displayName !== undefined) {
      if (!isDisplayName(body.displayName)) return fail(c, 400, "invalidDisplayName", { max: DISPLAY_NAME_MAX });
      const displayName = cleanDisplayName(body.displayName);
      sets.push("display_name = ?");
      values.push(displayName);
      if (displayName !== target.display_name) {
        before.displayName = target.display_name;
        after.displayName = displayName;
      }
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as Role)) return fail(c, 400, "invalidRole");
      if (!canAssignRole(c.get("user"), body.role as Role)) return fail(c, 403, "roleForbidden");
      sets.push("role = ?");
      values.push(body.role);
      if (body.role !== target.role) {
        before.role = target.role;
        after.role = body.role;
        guardOwner = true;
      }
    }
    if (body.permissions !== undefined) {
      const parsed = parsePermissions(body.permissions);
      if (!parsed) return fail(c, 400, "invalidPermissions");
      const sql = permissionsSql(parsed);
      sets.push(...sql.sets);
      values.push(...sql.values);
      const current = permissions(target);
      const changed = (Object.keys(parsed) as Array<keyof Permissions>).filter((k) => parsed[k] !== current[k]);
      if (changed.length) {
        before.permissions = Object.fromEntries(changed.map((k) => [k, current[k]]));
        after.permissions = Object.fromEntries(changed.map((k) => [k, parsed[k]]));
      }
    }
    if (body.disabled !== undefined) {
      if (typeof body.disabled !== "boolean") return fail(c, 400, "invalidField", { field: "disabled" });
      if (body.disabled) {
        sets.push("disabled_at = COALESCE(disabled_at, ?)");
        values.push(Date.now());
        revokeSessions = true;
        guardOwner = true;
      } else {
        sets.push("disabled_at = NULL");
      }
      if (body.disabled !== (target.disabled_at !== null)) {
        before.disabled = !body.disabled;
        after.disabled = body.disabled;
      }
    }
    if (body.password !== undefined) {
      const problem = passwordProblem(body.password);
      if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
      sets.push("password_hash = ?");
      values.push(await hashPassword(body.password as string));
      revokeSessions = true;
      unlock = true;
      after.password = "reset";
    }
    // `unlock: true` lifts the brute-force lock (setting a new password does too).
    let explicitUnlock = false;
    if (body.unlock !== undefined) {
      if (typeof body.unlock !== "boolean") return fail(c, 400, "invalidField", { field: "unlock" });
      explicitUnlock = body.unlock;
      unlock ||= body.unlock;
    }
    if (unlock) sets.push("failed_logins = 0", "locked_until = NULL");
    if (body.settings !== undefined) {
      const stored = storedSettings(target);
      const result = applySettingsPatch(stored, body.settings);
      if (!result.ok) return fail(c, 400, "invalidSettings", { keys: result.invalid.join(", ") });
      sets.push("settings = ?");
      values.push(JSON.stringify(result.settings));
      if (JSON.stringify(result.settings) !== JSON.stringify(stored)) {
        before.settings = stored;
        after.settings = result.settings;
      }
    }
    if (revokeSessions) sets.push("session_version = session_version + 1");
    if (!sets.length) return c.json({ user: adminUserView(target) });

    // The last-owner guard is part of the UPDATE itself, so concurrent requests cannot bypass it.
    const guard = guardOwner ? ` AND ${NOT_LAST_ACTIVE_OWNER}` : "";
    const guardValues = guardOwner ? [target.id, target.id] : [];
    const { meta } = await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?${guard}`)
      .bind(...values, target.id, ...guardValues)
      .run();
    const updated = await getUserById(c.env.DB, target.id);
    if (!updated) return fail(c, 404, "notFound");
    if (!meta.changes) return fail(c, 409, "lastOwner");

    if (Object.keys(after).length) await log(c, target.id, { action: "user.update", before, after });
    if (explicitUnlock) {
      await log(c, target.id, { action: "user.unlock" });
    }
    return c.json({ user: adminUserView(updated) });
  })

  .post("/users/:id/webhook-token", async (c) => {
    const target = await managedTarget(c);
    if (target instanceof Response) return target;
    const webhookToken = await regenerateWebhookToken(c.env.DB, target.id);
    if (!webhookToken) return fail(c, 404, "notFound");
    await log(c, target.id, { action: "user.token" });
    return c.json({ webhookToken });
  })

  // Permanent deletion; punches, day marks and change log entries go with it (ON DELETE CASCADE).
  .delete("/users/:id", async (c) => {
    const target = await managedTarget(c);
    if (target instanceof Response) return target;
    const { meta } = await c.env.DB.prepare(`DELETE FROM users WHERE id = ? AND ${NOT_LAST_ACTIVE_OWNER}`)
      .bind(target.id, target.id, target.id)
      .run();
    if (!meta.changes) return fail(c, 409, "lastOwner");
    // Belt and braces in case foreign keys are not enforced by the runtime (no-ops otherwise).
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM punches WHERE user_id = ?").bind(target.id),
      c.env.DB.prepare("DELETE FROM day_marks WHERE user_id = ?").bind(target.id),
      c.env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(target.id),
      c.env.DB.prepare(
        "DELETE FROM notifications WHERE audit_id IN (SELECT id FROM audit_log WHERE subject_id = ?)",
      ).bind(target.id),
      c.env.DB.prepare("DELETE FROM audit_log WHERE subject_id = ?").bind(target.id),
      c.env.DB.prepare("UPDATE audit_log SET actor_id = NULL WHERE actor_id = ?").bind(target.id),
    ]);
    // The account is gone: recordChange stores this entry without a subject (target = its former id).
    await log(c, target.id, {
      action: "user.delete",
      target: String(target.id),
      before: { username: target.username, displayName: target.display_name, role: target.role },
    });
    return c.json({ ok: true });
  });

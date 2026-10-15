import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { userDataPayload } from "../data";
import type { AppEnv, Role } from "../env";
import { fail, parseId, readBody } from "../http";
import { hashPassword } from "../passwords";
import {
  adminUserView,
  applySettingsPatch,
  createUser,
  DISPLAY_NAME_MAX,
  getUserById,
  isValidUsername,
  listUsers,
  NOT_LAST_ACTIVE_ADMIN,
  passwordProblem,
  PASSWORD_MAX,
  PASSWORD_MIN,
  regenerateWebhookToken,
  ROLES,
  storedSettings,
  USERNAME_MAX,
} from "../users";

const isDisplayName = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || (typeof v === "string" && v.length <= DISPLAY_NAME_MAX);

/** Normalizes an optional display name: blank strings become null. */
const cleanDisplayName = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/**
 * Account management API, admin role only. No UI uses it yet (accounts are normally managed with
 * the CLI); it is meant for scripts and a future admin page. Mounted under `/api/admin`.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin)

  .get("/users", async (c) => c.json({ users: (await listUsers(c.env.DB)).map(adminUserView) }))

  .post("/users", async (c) => {
    const body = await readBody(c);
    const username = typeof body.username === "string" ? body.username.trim() : body.username;
    if (!isValidUsername(username)) return fail(c, 400, "invalidUsername", { max: USERNAME_MAX });
    const problem = passwordProblem(body.password);
    if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
    if (!isDisplayName(body.displayName)) return fail(c, 400, "invalidDisplayName", { max: DISPLAY_NAME_MAX });
    const role = body.role ?? "user";
    if (!ROLES.includes(role as Role)) return fail(c, 400, "invalidRole");
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
      settings,
    });
    if (!user) return fail(c, 409, "usernameTaken");
    return c.json({ user: adminUserView(user), webhookToken: user.webhook_token }, 201);
  })

  .patch("/users/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const target = id === null ? null : await getUserById(c.env.DB, id);
    if (!target) return fail(c, 404, "notFound");
    const body = await readBody(c);

    const sets: string[] = [];
    const values: unknown[] = [];
    let revokeSessions = false;
    let unlock = false;
    let removesAdmin = false;

    if (body.displayName !== undefined) {
      if (!isDisplayName(body.displayName)) return fail(c, 400, "invalidDisplayName", { max: DISPLAY_NAME_MAX });
      sets.push("display_name = ?");
      values.push(cleanDisplayName(body.displayName));
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as Role)) return fail(c, 400, "invalidRole");
      sets.push("role = ?");
      values.push(body.role);
      if (body.role !== "admin") removesAdmin = true;
    }
    if (body.disabled !== undefined) {
      if (typeof body.disabled !== "boolean") return fail(c, 400, "invalidField", { field: "disabled" });
      if (body.disabled) {
        sets.push("disabled_at = COALESCE(disabled_at, ?)");
        values.push(Date.now());
        revokeSessions = true;
        removesAdmin = true;
      } else {
        sets.push("disabled_at = NULL");
      }
    }
    if (body.password !== undefined) {
      const problem = passwordProblem(body.password);
      if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
      sets.push("password_hash = ?");
      values.push(await hashPassword(body.password as string));
      revokeSessions = true;
      unlock = true;
    }
    // `unlock: true` lifts the brute-force lock (setting a new password does too).
    if (body.unlock !== undefined) {
      if (typeof body.unlock !== "boolean") return fail(c, 400, "invalidField", { field: "unlock" });
      unlock ||= body.unlock;
    }
    if (unlock) sets.push("failed_logins = 0", "locked_until = NULL");
    if (body.settings !== undefined) {
      const result = applySettingsPatch(storedSettings(target), body.settings);
      if (!result.ok) return fail(c, 400, "invalidSettings", { keys: result.invalid.join(", ") });
      sets.push("settings = ?");
      values.push(JSON.stringify(result.settings));
    }
    if (revokeSessions) sets.push("session_version = session_version + 1");
    if (!sets.length) return c.json({ user: adminUserView(target) });

    // The last-admin guard is part of the UPDATE itself, so concurrent requests cannot bypass it.
    const guard = removesAdmin ? ` AND ${NOT_LAST_ACTIVE_ADMIN}` : "";
    const guardValues = removesAdmin ? [target.id, target.id] : [];
    const { meta } = await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?${guard}`)
      .bind(...values, target.id, ...guardValues)
      .run();
    const updated = await getUserById(c.env.DB, target.id);
    if (!updated) return fail(c, 404, "notFound");
    if (!meta.changes) return fail(c, 409, "lastAdmin");
    return c.json({ user: adminUserView(updated) });
  })

  .post("/users/:id/webhook-token", async (c) => {
    const id = parseId(c.req.param("id"));
    const webhookToken = id === null ? null : await regenerateWebhookToken(c.env.DB, id);
    return webhookToken ? c.json({ webhookToken }) : fail(c, 404, "notFound");
  })

  // Permanent deletion; punches and day marks go with it (ON DELETE CASCADE).
  .delete("/users/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !(await getUserById(c.env.DB, id))) return fail(c, 404, "notFound");
    const { meta } = await c.env.DB.prepare(`DELETE FROM users WHERE id = ? AND ${NOT_LAST_ACTIVE_ADMIN}`)
      .bind(id, id, id)
      .run();
    if (!meta.changes) return fail(c, 409, "lastAdmin");
    // Belt and braces in case foreign keys are not enforced by the runtime (no-ops otherwise).
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM punches WHERE user_id = ?").bind(id),
      c.env.DB.prepare("DELETE FROM day_marks WHERE user_id = ?").bind(id),
    ]);
    return c.json({ ok: true });
  })

  .get("/users/:id/data", async (c) => {
    const id = parseId(c.req.param("id"));
    const user = id === null ? null : await getUserById(c.env.DB, id);
    return user ? c.json(await userDataPayload(c.env, user)) : fail(c, 404, "notFound");
  });

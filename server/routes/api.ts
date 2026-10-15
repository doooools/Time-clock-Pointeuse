import { Hono } from "hono";
import { resolveSettings } from "../../shared/settings";
import { issueSession, tooManyAttempts } from "../auth";
import { userDataPayload } from "../data";
import type { AppEnv } from "../env";
import { fail, readBody } from "../http";
import { verifyPassword } from "../passwords";
import { dataWriteRoutes, type SubjectResolver } from "../punches";
import {
  applySettingsPatch,
  capabilities,
  clearLoginFailures,
  instanceDefaults,
  passwordProblem,
  PASSWORD_MAX,
  PASSWORD_MIN,
  regenerateWebhookToken,
  reserveLoginAttempt,
  resolveUserSettings,
  setPassword,
  storedSettings,
} from "../users";

/** The signed-in user changes their own data: needs `editOwn` (owners and admins always have it). */
const selfSubject: SubjectResolver = async (c) => {
  const user = c.get("user");
  return capabilities(user).editOwn ? user : fail(c, 403, "editOwnForbidden");
};

/** Routes of the signed-in user. Mounted under `/api` after `requireSession`. */
export const apiRoutes = new Hono<AppEnv>()
  // Everything the front end needs; the computation runs client side.
  .get("/data", async (c) => c.json(await userDataPayload(c.env, c.get("user"))))

  // Punches and day marks (shared with the team routes, see server/punches.ts).
  .route("/", dataWriteRoutes(selfSubject))

  // --- Settings ---
  .get("/settings", (c) => {
    const user = c.get("user");
    return c.json({
      settings: resolveUserSettings(c.env, user),
      stored: storedSettings(user),
      defaults: resolveSettings(instanceDefaults(c.env)),
      webhookToken: user.webhook_token,
    });
  })
  .put("/settings", async (c) => {
    const user = c.get("user");
    const result = applySettingsPatch(storedSettings(user), await readBody(c));
    if (!result.ok) return fail(c, 400, "invalidSettings", { keys: result.invalid.join(", ") });
    const json = JSON.stringify(result.settings);
    await c.env.DB.prepare("UPDATE users SET settings = ? WHERE id = ?").bind(json, user.id).run();
    return c.json({ settings: resolveUserSettings(c.env, { settings: json }) });
  })

  // --- Own account ---
  .post("/me/password", async (c) => {
    const user = c.get("user");
    const { currentPassword, newPassword } = await readBody(c);
    // Same per-account lock as the login, so a stolen session cannot be used to guess the password.
    if (!(await reserveLoginAttempt(c.env.DB, user.id))) return tooManyAttempts(c, user);
    if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, user.password_hash))) {
      return fail(c, 400, "wrongCurrentPassword");
    }
    await clearLoginFailures(c.env.DB, user.id);
    const problem = passwordProblem(newPassword);
    if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
    const sessionVersion = await setPassword(c.env.DB, user.id, newPassword as string);
    if (sessionVersion === null) return fail(c, 401, "unauthorized");
    // Other sessions are revoked by the version bump; keep this one signed in.
    await issueSession(c, { id: user.id, session_version: sessionVersion });
    return c.json({ ok: true });
  })
  .post("/me/webhook-token", async (c) => {
    const webhookToken = await regenerateWebhookToken(c.env.DB, c.get("user").id);
    return webhookToken ? c.json({ webhookToken }) : fail(c, 401, "unauthorized");
  });

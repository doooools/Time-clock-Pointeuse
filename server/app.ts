import { Hono } from "hono";
import { resolveSettings } from "../shared/settings";
import { authRoutes, requireSession } from "./auth";
import type { AppEnv } from "./env";
import { fail } from "./http";
import { adminRoutes } from "./routes/admin";
import { apiRoutes } from "./routes/api";
import { webhookRoutes } from "./routes/webhook";
import { isValidSecret, MIN_SECRET_LENGTH } from "./session";
import { instanceDefaults } from "./users";

/**
 * The whole application, independent of the runtime: `app.fetch(request, env)` serves the API under
 * `/api/*` and everything else through `env.ASSETS` (the React front end).
 */
export const app = new Hono<AppEnv>();

// Every API request: default language from the instance, then refuse to run without a proper secret.
app.use("/api/*", async (c, next) => {
  c.set("locale", resolveSettings(instanceDefaults(c.env)).locale);
  if (!isValidSecret(c.env.SESSION_SECRET)) {
    return fail(c, 500, "missingSessionSecret", { min: MIN_SECRET_LENGTH });
  }
  await next();
});

app.route("/api/webhook", webhookRoutes);
app.route("/api", authRoutes);
app.use("/api/*", requireSession);
app.route("/api/admin", adminRoutes);
app.route("/api", apiRoutes);
app.all("/api/*", (c) => fail(c, 404, "notFound"));

// Everything else is the front end.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof SyntaxError) return fail(c, 400, "invalidJson");
  console.error(err);
  return fail(c, 500, "serverError");
});

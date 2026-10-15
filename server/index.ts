import { Hono } from "hono";
import { authRoutes, requireSession } from "./auth";
import type { AppEnv } from "./env";
import { apiRoutes } from "./routes/api";
import { webhookRoutes } from "./routes/webhook";

const app = new Hono<AppEnv>();

app.route("/api/webhook", webhookRoutes);
app.route("/api", authRoutes);
app.use("/api/*", requireSession);
app.route("/api", apiRoutes);
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// Tout le reste est servi par les assets (front React).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: "JSON invalide" }, 400);
  console.error(err);
  return c.json({ error: "Erreur serveur" }, 500);
});

export default app;

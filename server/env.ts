export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  WEBHOOK_TOKEN: string;
};

export type Role = "full" | "readonly";

export type AppEnv = { Bindings: Env; Variables: { role: Role } };

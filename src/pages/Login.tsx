import { useState, type FormEvent } from "react";
import { LangSwitch, Stamp } from "../components/Widgets";
import { useT } from "../i18n";
import { api, ApiError } from "../lib/api";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  /** "credentials" = wrong username or password; otherwise the server message. */
  const [error, setError] = useState<"credentials" | string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username.trim(), password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("credentials");
      else setError(err instanceof Error ? err.message : t("common.error"));
      setBusy(false);
    }
  }

  const refused = error === "credentials";
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[30px] px-[18px]">
      <LangSwitch className="absolute top-3 right-3" />
      <h1 className="-rotate-3 bg-paper px-[18px] py-0.5 font-display text-[40px] text-onpaper lg:text-5xl">{t("common.brand")}</h1>
      <form onSubmit={submit} className="relative flex w-full max-w-[340px] flex-col gap-3">
        <label htmlFor="login-username" className="lbl">
          {t("login.usernameLabel")}
        </label>
        <input
          id="login-username"
          className="field px-3.5 py-3 text-[22px]"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          aria-invalid={refused}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="login-password" className="lbl mt-1">
          {t("login.passwordLabel")}
        </label>
        <input
          id="login-password"
          type="password"
          className="field px-3.5 py-3 text-[22px]"
          autoComplete="current-password"
          value={password}
          aria-invalid={refused}
          aria-describedby={error ? "login-error" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <div id="login-error" role="alert" className="text-[15px] text-red-text">
            {refused ? t("login.wrongCredentials") : error}
          </div>
        )}
        {refused && (
          <Stamp className="absolute -top-[50px] -right-2 rotate-[14deg] border-4 border-current px-3 py-1 text-2xl text-red-text lg:-right-[60px]">
            {t("login.stampRefused")}
          </Stamp>
        )}
        <button
          className="btn mt-1 -rotate-1 bg-yellow p-3 text-lg text-onpaper hover:bg-yellow-hover hover:shadow-hard"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? t("login.checking") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { LangSwitch, Stamp } from "../components/Widgets";
import { useT } from "../i18n";
import { api } from "../lib/api";

export default function Login({ onSuccess }: { onSuccess: (readOnly: boolean) => void }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await api.login(password);
      onSuccess(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function viewOnly() {
    setBusy(true);
    try {
      await api.loginReadonly();
      onSuccess(true);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-[30px] px-[18px]">
      <LangSwitch className="absolute top-3 right-3" />
      <h1 className="-rotate-3 bg-paper px-[18px] py-0.5 font-display text-[40px] text-onpaper lg:text-5xl">{t("common.brand")}</h1>
      <form onSubmit={submit} className="relative flex w-full max-w-[340px] flex-col gap-3">
        <label htmlFor="mdp" className="lbl">
          {t("login.passwordLabel")}
        </label>
        <input
          id="mdp"
          type="password"
          className="field px-3.5 py-3 text-[22px]"
          autoFocus
          autoComplete="current-password"
          value={password}
          aria-invalid={error}
          aria-describedby={error ? "mdp-erreur" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <>
            <div id="mdp-erreur" className="text-[15px] text-[oklch(0.78_0.15_27)]">
              {t("login.wrongPassword")}
            </div>
            <Stamp className="absolute -top-[50px] -right-2 rotate-[14deg] border-4 border-current px-3 py-1 text-2xl text-red-text lg:-right-[60px]">
              {t("login.stampRefused")}
            </Stamp>
          </>
        )}
        <button
          className="btn -rotate-1 bg-yellow p-3 text-lg text-onpaper hover:bg-[oklch(0.92_0.15_100)] hover:shadow-hard"
          disabled={busy || !password}
        >
          {busy ? t("login.checking") : t("login.submit")}
        </button>
        <button
          type="button"
          className="cursor-pointer self-center pt-2 font-label text-base text-paper-muted underline decoration-dotted underline-offset-4 hover:text-yellow disabled:opacity-50"
          disabled={busy}
          onClick={viewOnly}
        >
          {t("login.readOnly")}
        </button>
      </form>
    </div>
  );
}

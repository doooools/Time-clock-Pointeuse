import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { workdaysPerWeek } from "../../shared/compute";
import { HOLIDAY_REGIONS, NO_HOLIDAYS } from "../../shared/holidays";
import type { Settings } from "../../shared/settings";
import { canonicalTimeZone } from "../../shared/time";
import IntegrationsGuide from "../components/IntegrationsGuide";
import { cx, LangSwitch, Toggle } from "../components/Widgets";
import { useLocale, useT } from "../i18n";
import { api, ApiError, UnauthorizedError, type SettingsInfo, type SettingsPatch } from "../lib/api";
import { dayShort, frDate, parseHm, parseSignedHm } from "../lib/dates";
import { dur, signed } from "../lib/fmt";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";

/** Settings edited through the form (the language is saved on its own, immediately). */
type FormKey = Exclude<keyof Settings, "locale">;

const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
})();

const TIME_ZONES: string[] = (() => {
  try {
    const list = Intl.supportedValuesOf("timeZone");
    return list.includes("UTC") ? list : ["UTC", ...list];
  } catch {
    return ["UTC", BROWSER_TZ];
  }
})();

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Box({ label, aside, htmlFor, children }: { label: ReactNode; aside?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-2 border-paper px-4 py-4 lg:px-5 lg:py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="lbl">
            {label}
          </label>
        ) : (
          <div className="lbl">{label}</div>
        )}
        {aside}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cx("self-start px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]", className)}>
      {children}
    </h2>
  );
}

const Help = ({ children }: { children: ReactNode }) => <p className="leading-normal text-pretty text-paper-soft">{children}</p>;
const Err = ({ id, children }: { id?: string; children: ReactNode }) => (
  <div id={id} className="text-[13px] text-red-text">
    {children}
  </div>
);

/* ─────────────── Rules, calendar, balance (one form) ─────────────── */

function RulesForm({ info, reload }: { info: SettingsInfo | null; reload: () => Promise<void> }) {
  const t = useT();
  const { settings, saveSettings } = useStore();
  /** Pending changes: a value, or null = back to the instance default. */
  const [edits, setEdits] = useState<SettingsPatch>({});
  const [targetText, setTargetText] = useState(dur(settings.dailyTargetMin));
  const [initialText, setInitialText] = useState(signed(settings.initialBalanceMin));
  const [tzText, setTzText] = useState(settings.timezone);
  const [busy, setBusy] = useState(false);

  const defaults = info?.defaults;
  const stored = info?.stored;

  /** Value shown in the form for `k`. */
  const valueOf = <K extends FormKey>(k: K): Settings[K] => {
    if (k in edits) {
      const v = edits[k];
      return (v === null ? (defaults?.[k] ?? settings[k]) : v) as Settings[K];
    }
    return settings[k];
  };
  /** Is `k` inherited from the instance (not stored on the account) once the pending changes are applied? */
  const isDefault = (k: FormKey): boolean => (k in edits ? edits[k] === null : !!stored && !(k in stored));

  // Text fields mirror the value whenever it changes from outside (reset, discard, save).
  const syncText = (patch: SettingsPatch, base: (k: FormKey) => unknown) => {
    if ("dailyTargetMin" in patch) setTargetText(dur(base("dailyTargetMin") as number));
    if ("initialBalanceMin" in patch) setInitialText(signed(base("initialBalanceMin") as number));
    if ("timezone" in patch) setTzText(base("timezone") as string);
  };

  const set = <K extends FormKey>(k: K, v: Settings[K] | null) => setEdits((e) => ({ ...e, [k]: v }));
  const reset = (k: FormKey) => {
    set(k, null);
    syncText({ [k]: null }, (key) => defaults?.[key] ?? settings[key]);
  };

  const targetMin = parseHm(targetText);
  const initialMin = parseSignedHm(initialText);
  const tzValid = canonicalTimeZone(tzText.trim());
  const invalid = targetMin === null || initialMin === null || !tzValid;

  /** Keys whose pending change really differs from what is saved. */
  const changed = (Object.keys(edits) as FormKey[]).filter((k) => {
    const v = edits[k];
    if (v === null) return !!stored && k in stored;
    return !sameValue(v, settings[k]);
  });
  const dirty = changed.length > 0;

  function discard() {
    setEdits({});
    setTargetText(dur(settings.dailyTargetMin));
    setInitialText(signed(settings.initialBalanceMin));
    setTzText(settings.timezone);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (invalid || !dirty) return;
    const patch: SettingsPatch = {};
    for (const k of changed) (patch as Record<string, unknown>)[k] = edits[k];
    setBusy(true);
    try {
      await saveSettings(patch);
      setEdits({});
      await reload();
    } catch {
      /* toast already shown by the store */
    } finally {
      setBusy(false);
    }
  }

  // After a save the effective settings change: realign the text fields when nothing is pending.
  useEffect(() => {
    if (Object.keys(edits).length) return;
    setTargetText(dur(settings.dailyTargetMin));
    setInitialText(signed(settings.initialBalanceMin));
    setTzText(settings.timezone);
  }, [settings]);

  /** "default" chip, or a button to go back to the instance value. */
  const origin = (k: FormKey, show: (v: never) => string) => {
    if (!defaults || !stored) return null;
    if (isDefault(k)) return <span className="font-label text-xs text-paper-dim uppercase">{t("settings.defaultTag")}</span>;
    const value = show(defaults[k] as never);
    return (
      <button
        type="button"
        className="cursor-pointer font-label text-xs text-paper-muted underline decoration-dotted underline-offset-4 hover:text-yellow"
        aria-label={t("settings.resetAria", { value })}
        onClick={() => reset(k)}
      >
        {t("settings.resetToDefault", { value })}
      </button>
    );
  };

  const workdays = valueOf("workdays");
  const restDayOn = valueOf("restDayPunchesCount");
  const holidays = valueOf("holidays");
  const startDate = valueOf("balanceStartDate");
  const regionName = (code: string) =>
    code === NO_HOLIDAYS ? t("settings.holidaysNone") : (HOLIDAY_REGIONS.find((r) => r.code === code)?.name ?? code);
  const workdaysText = (days: number[]) => days.map((d) => dayShort(d)).join(" ") || "—";

  return (
    <form onSubmit={save} className="flex flex-col gap-[22px]" aria-labelledby="rules">
      <SectionTitle id="rules" className="-rotate-2 bg-paper">
        {t("settings.rulesTitle")}
      </SectionTitle>

      <Box label={t("settings.targetLabel")} htmlFor="set-target" aside={origin("dailyTargetMin", (v: number) => dur(v))}>
        <div className="flex flex-wrap items-center gap-[18px]">
          <input
            id="set-target"
            className="w-[130px] bg-yellow px-3 py-2 text-[30px] font-bold text-onpaper outline-none focus:ring-3 focus:ring-yellow/35 aria-invalid:shadow-[inset_0_0_0_3px_var(--color-red)]"
            value={targetText}
            inputMode="text"
            aria-invalid={targetMin === null}
            aria-describedby={targetMin === null ? "set-target-err" : undefined}
            onChange={(e) => {
              setTargetText(e.target.value);
              const v = parseHm(e.target.value);
              if (v !== null) set("dailyTargetMin", v);
            }}
          />
          <span className="text-lg">
            {t("settings.perWeekBefore")} <b>{targetMin !== null ? dur(targetMin * workdaysPerWeek({ workdays })) : "—"}</b>{" "}
            {t("settings.perWeekAfter")}
          </span>
        </div>
        {targetMin === null && <Err id="set-target-err">{t("settings.formatError")}</Err>}
      </Box>

      <Box label={t("settings.workdaysLabel")} aside={origin("workdays", workdaysText)}>
        <div role="group" aria-label={t("settings.workdaysLabel")} className="grid grid-cols-7 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
            const on = workdays.includes(wd);
            return (
              <button
                key={wd}
                type="button"
                aria-pressed={on}
                onClick={() => set("workdays", on ? workdays.filter((d) => d !== wd) : [...workdays, wd].sort((a, b) => a - b))}
                className={cx(
                  "min-h-11 cursor-pointer px-1 font-label text-sm uppercase",
                  on ? "bg-yellow text-onpaper" : "text-paper-muted shadow-[inset_0_0_0_2px_var(--color-paper-dim)] hover:bg-coal",
                )}
              >
                {dayShort(wd)}
              </button>
            );
          })}
        </div>
        <Help>{workdays.length ? t("settings.workdaysHelp") : t("settings.workdaysNone")}</Help>
      </Box>

      <Box
        label={t("settings.restDayLabel")}
        aside={
          <span className="flex flex-wrap items-center gap-3">
            {origin("restDayPunchesCount", (v: boolean) => (v ? t("settings.on") : t("settings.off")))}
            <Toggle
              checked={restDayOn}
              onChange={(v) => set("restDayPunchesCount", v)}
              label={restDayOn ? t("settings.on") : t("settings.off")}
            />
          </span>
        }
      >
        <Help>{t("settings.restDayHelp", { target: targetMin !== null ? dur(targetMin) : "—" })}</Help>
      </Box>

      <Box label={t("settings.thresholdLabel")} aside={origin("shortPairMin", (v: number) => `${v} min`)}>
        <label className="flex flex-wrap items-center gap-[18px]">
          <input
            type="number"
            min={0}
            max={60}
            aria-label={t("settings.thresholdAria")}
            className="field w-[90px] px-2.5 py-1.5 text-2xl"
            value={valueOf("shortPairMin")}
            onChange={(e) => set("shortPairMin", Math.min(60, Math.max(0, Math.round(Number(e.target.value) || 0))))}
          />
          <span>{t("settings.thresholdHelp")}</span>
        </label>
      </Box>

      <SectionTitle id="calendar" className="mt-4 rotate-[1deg] bg-blue text-white">
        {t("settings.calendarTitle")}
      </SectionTitle>

      <Box label={t("settings.timezoneLabel")} htmlFor="set-tz" aside={origin("timezone", (v: string) => v)}>
        <input
          id="set-tz"
          list="set-tz-list"
          className="field w-full max-w-[420px] text-lg"
          placeholder={t("settings.timezonePlaceholder")}
          autoComplete="off"
          spellCheck={false}
          value={tzText}
          aria-invalid={!tzValid}
          aria-describedby="set-tz-help"
          onChange={(e) => {
            setTzText(e.target.value);
            const tz = canonicalTimeZone(e.target.value.trim());
            if (tz) set("timezone", tz);
          }}
        />
        <datalist id="set-tz-list">
          {TIME_ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <div id="set-tz-help" className="flex flex-col gap-1.5">
          {!tzValid && <Err>{t("settings.timezoneInvalid")}</Err>}
          <Help>{t("settings.timezoneHelp")}</Help>
          {tzValid && tzValid !== BROWSER_TZ && (
            <p className="text-[15px] text-pink">{t("settings.timezoneMismatch", { tz: BROWSER_TZ })}</p>
          )}
        </div>
        {tzValid !== BROWSER_TZ && (
          <button
            type="button"
            className="btn-secondary self-start px-3 py-1.5 text-[15px]"
            onClick={() => {
              setTzText(BROWSER_TZ);
              set("timezone", BROWSER_TZ);
            }}
          >
            {t("settings.timezoneUseBrowser", { tz: BROWSER_TZ })}
          </button>
        )}
      </Box>

      <Box label={t("settings.holidaysLabel")} htmlFor="set-holidays" aside={origin("holidays", regionName)}>
        <select
          id="set-holidays"
          className="field w-full max-w-[420px] cursor-pointer bg-ink text-lg"
          value={holidays}
          onChange={(e) => set("holidays", e.target.value)}
        >
          <option value={NO_HOLIDAYS}>{t("settings.holidaysNone")}</option>
          {HOLIDAY_REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
        <Help>{t("settings.holidaysHelp")}</Help>
      </Box>

      <SectionTitle id="balance" className="mt-4 -rotate-1 bg-pink">
        {t("settings.balanceTitle")}
      </SectionTitle>

      <Box
        label={t("settings.balanceStartLabel")}
        htmlFor="set-start"
        aside={origin("balanceStartDate", (v: string | null) => (v ? frDate(v) : t("settings.firstPunch")))}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="set-start"
            type="date"
            className="field text-lg"
            value={startDate ?? ""}
            onChange={(e) => set("balanceStartDate", e.target.value || null)}
          />
          {startDate ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-[15px]" onClick={() => set("balanceStartDate", null)}>
              {t("settings.balanceStartClear")}
            </button>
          ) : (
            <span className="text-paper-muted">{t("settings.firstPunch")}</span>
          )}
        </div>
        <Help>{t("settings.balanceStartHelp")}</Help>
      </Box>

      <Box label={t("settings.initialBalanceLabel")} htmlFor="set-initial" aside={origin("initialBalanceMin", (v: number) => signed(v))}>
        <input
          id="set-initial"
          className="field w-[160px] text-2xl"
          aria-label={t("settings.initialBalanceAria")}
          value={initialText}
          aria-invalid={initialMin === null}
          aria-describedby="set-initial-help"
          onChange={(e) => {
            setInitialText(e.target.value);
            const v = parseSignedHm(e.target.value);
            if (v !== null) set("initialBalanceMin", v);
          }}
        />
        <div id="set-initial-help">
          {initialMin === null && <Err>{t("settings.initialBalanceError")}</Err>}
          <Help>{t("settings.initialBalanceHelp")}</Help>
        </div>
      </Box>

      <div className="sticky bottom-[84px] z-10 flex flex-wrap items-center gap-3 bg-ink py-3 lg:bottom-0">
        <button type="submit" className="btn-primary" disabled={!dirty || invalid || busy}>
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
        {dirty && (
          <>
            <button type="button" className="btn-secondary" onClick={discard} disabled={busy}>
              {t("settings.discard")}
            </button>
            <span className="font-label text-sm text-pink">{t("settings.unsaved")}</span>
          </>
        )}
      </div>
    </form>
  );
}

/* ─────────────── Account ─────────────── */

function PasswordForm() {
  const t = useT();
  const toast = useToast();
  const { logout, user } = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && next.length >= 8 && confirm === next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(t("settings.passwordChanged"));
    } catch (err) {
      if (err instanceof UnauthorizedError) return logout();
      setError(err instanceof ApiError || err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const field = "field w-full text-lg";
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label={t("settings.passwordTitle")}>
      <div className="lbl">{t("settings.passwordTitle")}</div>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="text" autoComplete="username" value={user.username} readOnly hidden />
      <label className="flex flex-col gap-1 text-[15px]">
        {t("settings.currentPassword")}
        <input type="password" className={field} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[15px]">
        {t("settings.newPassword")}
        <input
          type="password"
          className={field}
          autoComplete="new-password"
          minLength={8}
          value={next}
          aria-invalid={tooShort}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      {tooShort && <Err>{t("settings.passwordTooShort")}</Err>}
      <label className="flex flex-col gap-1 text-[15px]">
        {t("settings.confirmPassword")}
        <input
          type="password"
          className={field}
          autoComplete="new-password"
          value={confirm}
          aria-invalid={mismatch}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {mismatch && <Err>{t("settings.passwordMismatch")}</Err>}
      {error && (
        <div role="alert" className="text-[15px] text-red-text">
          ✕ {error}
        </div>
      )}
      <button type="submit" className="btn-secondary self-start" disabled={!ready || busy}>
        {t("settings.passwordSubmit")}
      </button>
    </form>
  );
}

function AccountSection({ info, reload }: { info: SettingsInfo | null; reload: () => Promise<void> }) {
  const t = useT();
  const { user, logout, saveSettings } = useStore();
  const { setLocale } = useLocale();
  const localeIsDefault = info ? !("locale" in info.stored) : false;

  const changeLocale = async (patch: SettingsPatch) => {
    if (patch.locale) setLocale(patch.locale);
    await saveSettings(patch, { quiet: true }).catch(() => {});
    await reload();
  };

  return (
    <section className="flex flex-col gap-[22px]" aria-labelledby="account">
      <SectionTitle id="account" className="-rotate-1 bg-yellow">
        {t("settings.accountTitle")}
      </SectionTitle>
      <div className="flex flex-col gap-5 border-2 border-paper px-4 py-4 lg:px-5 lg:py-[18px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="lbl">{t("settings.usernameLabel")}</dt>
          <dd className="font-bold break-all">
            {user.username}
            {user.role === "admin" && <span className="ml-2 bg-paper px-1.5 font-label text-xs text-onpaper uppercase">{t("settings.roleAdmin")}</span>}
          </dd>
          {user.displayName && (
            <>
              <dt className="lbl">{t("settings.displayNameLabel")}</dt>
              <dd className="break-all">{user.displayName}</dd>
            </>
          )}
        </dl>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="lbl">{t("common.language")}</div>
            <span className="flex items-center gap-3">
              {info &&
                (localeIsDefault ? (
                  <span className="font-label text-xs text-paper-dim uppercase">{t("settings.defaultTag")}</span>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer font-label text-xs text-paper-muted underline decoration-dotted underline-offset-4 hover:text-yellow"
                    onClick={() => changeLocale({ locale: null })}
                  >
                    {t("settings.resetToDefault", { value: info.defaults.locale.toUpperCase() })}
                  </button>
                ))}
              <LangSwitch onChange={(locale) => changeLocale({ locale })} />
            </span>
          </div>
          <Help>{t("settings.languageHelp")}</Help>
        </div>

        <PasswordForm />

        <button type="button" className="btn-danger self-start" onClick={() => logout()}>
          {t("settings.logout")}
        </button>
      </div>
    </section>
  );
}

/* ─────────────── Webhook ─────────────── */

function WebhookSection({ token, onToken }: { token: string | null; onToken: (token: string) => void }) {
  const t = useT();
  const toast = useToast();
  const { logout } = useStore();
  const [reveal, setReveal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = `${window.location.origin}/api/webhook/punch?token=`;
  const webhookUrl = `${base}${token ?? ""}`;
  const shown = token
    ? reveal
      ? webhookUrl
      : `${base}${"•".repeat(Math.max(8, token.length - 4))}${token.slice(-4)}`
    : t("settings.loadingToken");

  async function regenerate() {
    setBusy(true);
    try {
      const r = await api.regenerateWebhookToken();
      onToken(r.webhookToken);
      setConfirming(false);
      setReveal(true);
      toast(t("settings.regenerated"));
    } catch (err) {
      if (err instanceof UnauthorizedError) return logout();
      toast(err instanceof Error ? err.message : t("common.error"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-[22px]" aria-labelledby="chip">
      <SectionTitle id="chip" className="rotate-[1.5deg] bg-pink">
        {t("settings.chipTitle")}
      </SectionTitle>
      <div className="paper-card flex rotate-[.4deg] flex-col gap-3.5 px-[22px] py-5">
        <div className="tape right-[60px] rotate-[4deg] bg-yellow/75" />
        <div className="flex justify-between font-label text-[15px]">
          <span>{t("settings.webhookUrl")}</span>
          <span className="bg-onpaper px-2 py-px text-yellow">{t("settings.secret")}</span>
        </div>
        <div className="border-2 border-onpaper bg-white px-3 py-2.5 break-all" aria-live="polite">
          {shown}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className="btn-ink px-3.5 py-2 text-[15px] text-paper"
            disabled={!token}
            onClick={() =>
              navigator.clipboard
                .writeText(webhookUrl)
                .then(() => toast(t("settings.copied")))
                .catch(() => toast(t("settings.copyFailed"), { tone: "error" }))
            }
          >
            {t("settings.copy")}
          </button>
          <button type="button" className="btn-ink-outline px-3.5 py-1.5 text-[15px]" disabled={!token} onClick={() => setReveal(!reveal)}>
            {reveal ? t("settings.hide") : t("settings.show")}
          </button>
          {!confirming && (
            <button type="button" className="btn-ink-outline px-3.5 py-1.5 text-[15px]" disabled={!token} onClick={() => setConfirming(true)}>
              {t("settings.regenerate")}
            </button>
          )}
        </div>
        {confirming && (
          <div role="alertdialog" aria-labelledby="regen-q" className="flex flex-col gap-2.5 border-2 border-red bg-white px-3 py-2.5">
            <p id="regen-q" className="text-[15px] leading-snug">
              {t("settings.regenerateConfirm")}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className="btn bg-red px-3.5 py-1.5 text-[15px] text-white" disabled={busy} onClick={regenerate}>
                {t("settings.regenerateYes")}
              </button>
              <button type="button" className="btn-ink-outline px-3.5 py-1.5 text-[15px]" disabled={busy} onClick={() => setConfirming(false)}>
                {t("settings.regenerateNo")}
              </button>
            </div>
          </div>
        )}
        <p className="text-sm leading-snug text-onpaper-muted">{t("settings.tokenHelp")}</p>
      </div>

      <a href="#tuto" className="self-start font-label text-base text-yellow underline decoration-dotted underline-offset-4 hover:no-underline">
        {t("settings.tutorialLink")}
      </a>
    </section>
  );
}

/* ─────────────── Page ─────────────── */

export default function SettingsPage() {
  const { logout } = useStore();
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await api.settings();
      setInfo(r);
      setToken(r.webhookToken);
    } catch (err) {
      if (err instanceof UnauthorizedError) logout();
    }
  }, [logout]);

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="grid items-start gap-12 pt-6 lg:grid-cols-2 lg:gap-10 lg:pt-10">
      <RulesForm info={info} reload={reload} />
      <div className="flex flex-col gap-12">
        <AccountSection info={info} reload={reload} />
        <WebhookSection token={token} onToken={setToken} />
      </div>
      <IntegrationsGuide />
    </div>
  );
}

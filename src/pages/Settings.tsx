import { useEffect, useState, type ReactNode } from "react";
import { workdaysPerWeek, type Settings } from "../../shared/compute";
import TaskerGuide from "../components/TaskerGuide";
import { LangSwitch, Toggle } from "../components/Widgets";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { parseHm } from "../lib/dates";
import { dur } from "../lib/fmt";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";

function Box({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-2 border-paper px-5 py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="lbl">{label}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const { settings, saveSettings, readOnly } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Settings>(settings);
  const [target, setTarget] = useState(dur(settings.dailyTargetMin));
  const [token, setToken] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readOnly) return;
    api.settings().then((r) => setToken(r.webhookToken)).catch(() => {});
  }, [readOnly]);

  const targetMin = parseHm(target);
  const dirty =
    targetMin !== settings.dailyTargetMin ||
    draft.weekendCountsAsWorkday !== settings.weekendCountsAsWorkday ||
    draft.fridayIsWorkday !== settings.fridayIsWorkday ||
    draft.shortPairMin !== settings.shortPairMin;

  const base = `${window.location.origin}/api/webhook/punch?token=`;
  const webhookUrl = `${base}${token ?? ""}`;
  const shown = token ? (reveal ? webhookUrl : `${base}${"•".repeat(Math.max(8, token.length - 4))}${token.slice(-4)}`) : t("settings.loadingToken");

  async function save() {
    if (targetMin === null || targetMin <= 0) return toast(t("settings.invalidTarget"), { tone: "error" });
    setBusy(true);
    try {
      await saveSettings({ ...draft, dailyTargetMin: targetMin });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-12 pt-6 lg:grid-cols-2 lg:gap-10 lg:pt-10">
      <section className="flex flex-col gap-[22px]" aria-labelledby="regles">
        {/* Read-only: the rules stay visible but frozen. */}
        <fieldset disabled={readOnly} className="contents">
        <h1 id="regles" className="-rotate-2 self-start bg-paper px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
          {t("settings.rulesTitle")}
        </h1>

        <Box label={t("settings.targetLabel", { end: t(draft.fridayIsWorkday ? "settings.endFri" : "settings.endThu") })}>
          <label className="flex flex-wrap items-center gap-[18px]">
            <span className="sr-only">{t("settings.targetAria")}</span>
            <input
              className="w-[130px] bg-yellow px-3 py-2 text-[30px] font-bold text-onpaper outline-none focus:shadow-[0_0_0_3px_oklch(0.88_0.17_100/.35)] aria-invalid:shadow-[inset_0_0_0_3px_var(--color-red)]"
              value={target}
              aria-invalid={targetMin === null}
              onChange={(e) => setTarget(e.target.value)}
            />
            <span className="text-lg">
              {t("settings.perWeekBefore")} <b>{targetMin !== null ? dur(targetMin * workdaysPerWeek(draft)) : "—"}</b> {t("settings.perWeekAfter")}
            </span>
          </label>
          {targetMin === null && <div className="text-[13px] text-red-text">{t("settings.formatError")}</div>}
        </Box>

        <Box
          label={t("settings.fridayLabel")}
          aside={
            <Toggle
              checked={draft.fridayIsWorkday}
              onChange={(v) => setDraft({ ...draft, fridayIsWorkday: v })}
              label={draft.fridayIsWorkday ? t("settings.yes") : t("settings.no")}
            />
          }
        >
          <p className="leading-normal text-pretty text-[oklch(0.85_0.01_90)]">{t("settings.fridayHelp")}</p>
        </Box>

        <Box
          label={t("settings.weekendLabel")}
          aside={
            <Toggle
              checked={draft.weekendCountsAsWorkday}
              onChange={(v) => setDraft({ ...draft, weekendCountsAsWorkday: v })}
              label={draft.weekendCountsAsWorkday ? t("settings.on") : t("settings.off")}
            />
          }
        >
          <p className="leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
            {t(draft.fridayIsWorkday ? "settings.weekendHelpSatSun" : "settings.weekendHelpFriSun", {
              target: targetMin !== null ? dur(targetMin) : "—",
            })}
          </p>
        </Box>

        <Box label={t("settings.thresholdLabel")}>
          <label className="flex flex-wrap items-center gap-[18px]">
            <input
              type="number"
              min={0}
              aria-label={t("settings.thresholdAria")}
              className="field w-[80px] px-2.5 py-1.5 text-2xl"
              value={draft.shortPairMin}
              onChange={(e) => setDraft({ ...draft, shortPairMin: Math.max(0, Number(e.target.value)) })}
            />
            <span>{t("settings.thresholdHelp")}</span>
          </label>
        </Box>

        </fieldset>

        {/* Provisional: T8 will bind the language to the account setting. */}
        <Box label={t("common.language")} aside={<LangSwitch />}>
          <></>
        </Box>

        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button className="btn-primary" onClick={save} disabled={!dirty || busy}>
              {t("settings.save")}
            </button>
          )}
          <button className="btn-danger" onClick={() => api.logout().then(() => window.location.reload())}>
            {readOnly ? t("settings.leaveReadOnly") : t("settings.logout")}
          </button>
        </div>
      </section>

      {!readOnly && (
      <section className="flex flex-col gap-[22px]" aria-labelledby="puce">
        <h2 id="puce" className="rotate-[1.5deg] self-start bg-pink px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
          {t("settings.chipTitle")}
        </h2>
        <div className="paper-card flex rotate-[.4deg] flex-col gap-3.5 px-[22px] py-5">
          <div className="tape right-[60px] rotate-[4deg] bg-[oklch(0.88_0.17_100/.75)]" />
          <div className="flex justify-between font-label text-[15px]">
            <span>{t("settings.webhookUrl")}</span>
            <span className="bg-onpaper px-2 py-px text-yellow">{t("settings.secret")}</span>
          </div>
          <div className="border-2 border-onpaper bg-white px-3 py-2.5 break-all">{shown}</div>
          <div className="flex flex-wrap gap-2.5">
            <button
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
            <button className="btn-ink-outline px-3.5 py-1.5 text-[15px]" disabled={!token} onClick={() => setReveal(!reveal)}>
              {reveal ? t("settings.hide") : t("settings.show")}
            </button>
          </div>
          <p className="text-sm leading-snug text-[oklch(0.35_0_0)]">
            {t("settings.tokenHelp")} <code>npx wrangler secret put WEBHOOK_TOKEN</code>.
          </p>
        </div>

        <a href="#tuto" className="self-start font-label text-base text-yellow underline decoration-dotted underline-offset-4 hover:no-underline">
          {t("settings.tutorialLink")}
        </a>
      </section>
      )}

      {!readOnly && <TaskerGuide />}
    </div>
  );
}

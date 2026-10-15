import { useState, type ReactNode } from "react";
import { useT, type TFn } from "../i18n";
import type { integrations } from "../i18n/locales/fr/integrations";

// Integrations guide: Android (Tasker + NFC), iPhone (Shortcuts) and plain HTTP clients.
// All texts live in the `integrations` i18n namespace. Strings use a tiny inline markup:
// **bold** and `code`.

type Tab = "android" | "ios" | "http";
type Tone = "yellow" | "red";

/** A key of the `integrations` namespace: checked by the compiler, so a missing text is a build error. */
type IKey = keyof typeof integrations;
const key = (name: IKey) => `integrations.${name}` as const;

/** Renders a string with **bold** and `code` inline markup. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <b key={i} className="text-paper">{p.slice(2, -2)}</b>;
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
          return (
            <code key={i} className="bg-coal px-1.5 py-px break-words text-yellow">
              {p.slice(1, -1)}
            </code>
          );
        return p;
      })}
    </>
  );
}

function Step({ n, bg, title, time, children }: { n: number; bg: string; title: string; time?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[44px_1fr] items-start gap-x-4 gap-y-2 border-t-2 border-line pt-5">
      <span className={`${bg} text-center font-display text-[26px] text-onpaper`}>{n}</span>
      <div className="flex min-w-0 flex-col gap-3 leading-[1.5]">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{title}</h3>
          {time && <span className="font-label text-sm text-paper-dim">{time}</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Lettered list of sub-steps. */
const Sub = ({ children }: { children: ReactNode }) => (
  <ol className="flex list-[lower-alpha] flex-col gap-1.5 pl-6 text-pretty marker:font-label marker:text-paper-dim">{children}</ol>
);

const Tip = ({ children, tone = "yellow" }: { children: ReactNode; tone?: Tone }) => (
  <p className={`border-l-4 ${tone === "red" ? "border-red-text" : "border-yellow"} bg-coal px-3 py-2 text-[15px] text-pretty`}>{children}</p>
);

const Block = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto border-2 border-line bg-coal p-3 text-sm leading-snug text-yellow">
    <code>{children}</code>
  </pre>
);

/** Static description of a step: its texts (typed keys), badge colour and optional extras. */
type StepDef = {
  id: string;
  bg: string;
  title: IKey;
  time: IKey;
  items: IKey[];
  bullets?: boolean;
  intro?: IKey;
  outro?: IKey;
  tip?: { tone: Tone; text: IKey; vars?: boolean };
  /** Extra content shown after the item `afterItem`. */
  extra?: { afterItem: IKey; node: (t: TFn) => ReactNode };
};

const HTTP_FIELDS: [IKey, IKey][] = [
  ["hf1_k", "hf1_v"],
  ["hf2_k", "hf2_v"],
  ["hf3_k", "hf3_v"],
  ["hf4_k", "hf4_v"],
  ["hf5_k", "hf5_v"],
  ["hf6_k", "hf6_v"],
];
const VAR_KEYS: [string, IKey][] = [
  ["%http_data.message", "var_message"],
  ["%http_data.action", "var_action"],
  ["%http_data.time", "var_time"],
  ["%http_data.worked_today", "var_worked_today"],
  ["%http_data.remaining_today", "var_remaining_today"],
  ["%http_data.departure", "var_departure"],
  ["%http_data.balance", "var_balance"],
  ["%http_response_code", "var_response_code"],
];

const ANDROID_STEPS: StepDef[] = [
  { id: "a0", bg: "bg-paper", title: "a0_title", time: "a0_time", items: ["a0_i1", "a0_i2", "a0_i3", "a0_i4"], bullets: true },
  { id: "a1", bg: "bg-yellow", title: "a1_title", time: "a1_time", items: ["a1_i1", "a1_i2", "a1_i3"] },
  {
    id: "a2",
    bg: "bg-pink",
    title: "a2_title",
    time: "a2_time",
    intro: "a2_intro",
    items: ["a2_i1", "a2_i2", "a2_i3", "a2_i4", "a2_i5", "a2_i6"],
    tip: { tone: "yellow", text: "a2_tip", vars: true },
    extra: {
      afterItem: "a2_i2",
      node: (t) => (
        <>
          <dl className="grid grid-cols-1 border-2 border-line sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {HTTP_FIELDS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="border-line px-3 pt-2 font-label text-sm text-paper-muted sm:border-b sm:pb-2">{t(key(k))}</dt>
                <dd className="border-b border-line px-3 pt-0.5 pb-2 text-[15px] sm:pt-2">
                  <Rich text={t(key(v))} />
                </dd>
              </div>
            ))}
          </dl>
          <span className="mt-2 block">
            <Rich text={t(key("a2_i2_after"))} />
          </span>
        </>
      ),
    },
  },
  {
    id: "a3",
    bg: "bg-paper",
    title: "a3_title",
    time: "a3_time",
    items: ["a3_i1", "a3_i2", "a3_i3", "a3_i4"],
    tip: { tone: "red", text: "a3_tip" },
  },
  {
    id: "a4",
    bg: "bg-yellow",
    title: "a4_title",
    time: "a4_time",
    intro: "a4_intro",
    items: ["a4_i1", "a4_i2"],
    outro: "a4_outro",
  },
  { id: "a5", bg: "bg-pink", title: "a5_title", time: "a5_time", items: ["a5_i1", "a5_i2", "a5_i3"] },
];

const IOS_STEPS: StepDef[] = [
  { id: "i0", bg: "bg-paper", title: "i0_title", time: "i0_time", items: ["i0_i1", "i0_i2"], bullets: true },
  {
    id: "i1",
    bg: "bg-yellow",
    title: "i1_title",
    time: "i1_time",
    items: ["i1_i1", "i1_i2", "i1_i3", "i1_i4", "i1_i5"],
    tip: { tone: "yellow", text: "i1_tip" },
  },
  { id: "i2", bg: "bg-pink", title: "i2_title", time: "i2_time", items: ["i2_i1", "i2_i2", "i2_i3", "i2_i4"] },
  { id: "i3", bg: "bg-paper", title: "i3_title", time: "i3_time", items: ["i3_i1", "i3_i2"], bullets: true },
];

const ANDROID_TROUBLES: [IKey, IKey][] = [
  ["ta1_q", "ta1_a"],
  ["ta2_q", "ta2_a"],
  ["ta3_q", "ta3_a"],
  ["ta4_q", "ta4_a"],
  ["ta5_q", "ta5_a"],
  ["ta6_q", "ta6_a"],
  ["ta7_q", "ta7_a"],
  ["ta8_q", "ta8_a"],
];
const IOS_TROUBLES: [IKey, IKey][] = [
  ["ti1_q", "ti1_a"],
  ["ti2_q", "ti2_a"],
  ["ti3_q", "ti3_a"],
  ["ti4_q", "ti4_a"],
  ["ti5_q", "ti5_a"],
];

function StepList({ defs }: { defs: StepDef[] }) {
  const t = useT();
  return (
    <ol className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      {defs.map((d, idx) => {
        return (
          <Step key={d.id} n={idx} bg={d.bg} title={t(key(d.title))} time={t(key(d.time))}>
            {d.intro && (
              <p className="text-pretty">
                <Rich text={t(key(d.intro))} />
              </p>
            )}
            {d.bullets ? (
              <ul className="flex list-['✓__'] flex-col gap-1.5 pl-6 marker:text-yellow">
                {d.items.map((k) => (
                  <li key={k}>
                    <Rich text={t(key(k))} />
                  </li>
                ))}
              </ul>
            ) : (
              <Sub>
                {d.items.map((k) => (
                  <li key={k}>
                    <Rich text={t(key(k))} />
                    {d.extra?.afterItem === k && <div className="mt-2">{d.extra.node(t)}</div>}
                  </li>
                ))}
              </Sub>
            )}
            {d.outro && (
              <p className="text-[15px] text-pretty text-paper-muted">
                <Rich text={t(key(d.outro))} />
              </p>
            )}
            {d.tip && (
              <Tip tone={d.tip.tone}>
                <Rich text={t(key(d.tip.text))} />
                {d.tip.vars && (
                  <span className="mt-2 grid grid-cols-1 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                    {VAR_KEYS.map(([v, k]) => (
                      <span key={v} className="contents">
                        <code className="mt-1.5 w-fit max-w-full bg-coal px-1.5 py-px break-all text-yellow sm:mt-0">{v}</code>
                        <span className="text-paper-muted">
                          <Rich text={t(key(k))} />
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </Tip>
            )}
          </Step>
        );
      })}
    </ol>
  );
}

function Troubles({ items }: { items: [IKey, IKey][] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="lbl">{t("integrations.trouble_label")}</div>
      {items.map(([q, a]) => (
        <details key={q} className="group border-2 border-line open:border-paper">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 font-bold marker:hidden hover:bg-coal [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="font-label text-yellow group-open:rotate-90">
              ›
            </span>
            {t(key(q))}
          </summary>
          <p className="px-4 pb-4 pl-10 leading-normal text-pretty text-paper-soft">
            <Rich text={t(key(a))} />
          </p>
        </details>
      ))}
    </div>
  );
}

function Security({ tokenKey, variants }: { tokenKey: IKey; variants: IKey[] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="lbl">{t("integrations.security_label")}</div>
      <Tip tone="red">
        <Rich text={t(key(tokenKey))} />
      </Tip>
      {variants.length > 0 && (
        <ul className="flex list-['›__'] flex-col gap-3 pl-6 leading-normal text-pretty marker:text-yellow">
          {variants.map((v) => (
            <li key={v}>
              <Rich text={t(key(v))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AndroidTab() {
  const t = useT();
  return (
    <>
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-paper-soft">
        <Rich text={t("integrations.android_intro")} />
      </p>
      <StepList defs={ANDROID_STEPS} />
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Troubles items={ANDROID_TROUBLES} />
        <Security tokenKey="android_sec_token" variants={["av1", "av2", "av3", "av4"]} />
      </div>
    </>
  );
}

function IosTab() {
  const t = useT();
  return (
    <>
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-paper-soft">
        <Rich text={t("integrations.ios_intro")} />
      </p>
      <StepList defs={IOS_STEPS} />
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Troubles items={IOS_TROUBLES} />
        <Security tokenKey="ios_sec_token" variants={[]} />
      </div>
    </>
  );
}

function HttpTab() {
  const t = useT();
  const origin = typeof window === "undefined" ? "https://pointeuse.example.com" : window.location.origin;
  const url = `${origin}/api/webhook/punch`;
  const curl = `curl -fsS -X POST -H "X-Webhook-Token: YOUR_TOKEN" ${url}`;
  const powershell = `$headers = @{ "X-Webhook-Token" = "YOUR_TOKEN" }\nInvoke-RestMethod -Method Post -Uri "${url}" -Headers $headers`;
  const homeAssistant = `# secrets.yaml\nopointeuse_token: YOUR_TOKEN\n\n# configuration.yaml\nrest_command:\n  opointeuse_punch:\n    url: "${url}"\n    method: post\n    headers:\n      X-Webhook-Token: !secret opointeuse_token`;
  const sample = `{ "ok": true, "action": "in", "time": "08:12", "worked_today": "0h00",\n  "remaining_today": "7h00", "departure": "15:12", "balance": "+1h03",\n  "message": "..." }`;
  return (
    <>
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-paper-soft">
        <Rich text={t("integrations.http_intro")} />
      </p>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h1_title")}</h3>
          <ul className="flex list-['›__'] flex-col gap-1.5 pl-6 text-pretty marker:text-yellow">
            {(["h1_i1", "h1_i2", "h1_i3"] as const).map((k) => (
              <li key={k}>
                <Rich text={t(key(k))} />
              </li>
            ))}
          </ul>
        </section>
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h2_title")}</h3>
          <p className="text-pretty">
            <Rich text={t("integrations.h2_intro")} />
          </p>
          <Block>{sample}</Block>
        </section>
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h3_title")}</h3>
          <Block>{curl}</Block>
        </section>
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h4_title")}</h3>
          <Block>{powershell}</Block>
        </section>
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h5_title")}</h3>
          <p className="text-pretty">
            <Rich text={t("integrations.h5_intro")} />
          </p>
          <Block>{homeAssistant}</Block>
        </section>
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h6_title")}</h3>
          <p className="text-pretty">
            <Rich text={t("integrations.h6_intro")} />
          </p>
        </section>
      </div>
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Security tokenKey="http_sec_token" variants={["http_v1", "http_v2"]} />
      </div>
    </>
  );
}

const TABS: { id: Tab; label: IKey }[] = [
  { id: "android", label: "tab_android" },
  { id: "ios", label: "tab_ios" },
  { id: "http", label: "tab_http" },
];

export default function IntegrationsGuide() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("android");
  return (
    <section className="flex flex-col gap-6 lg:col-span-2" aria-labelledby="tuto">
      <div className="flex flex-col gap-3">
        <h2 id="tuto" className="-rotate-1 self-start bg-yellow px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
          {t("integrations.guide_title")}
        </h2>
        <p className="max-w-[75ch] text-lg leading-normal text-pretty text-paper-soft">
          {t("integrations.guide_intro", { example: t("integrations.guide_example") })}
        </p>
        <p className="max-w-[75ch] text-[15px] text-pretty text-paper-muted">{t("integrations.docs_hint")}</p>
      </div>

      <div role="tablist" aria-label={t("integrations.title")} className="flex flex-wrap gap-2">
        {TABS.map((x) => {
          const active = tab === x.id;
          return (
            <button
              key={x.id}
              id={`tab-${x.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${x.id}`}
              onClick={() => setTab(x.id)}
              className={`border-2 px-4 py-2 font-label text-sm uppercase ${active ? "border-yellow bg-yellow text-onpaper" : "border-line hover:bg-coal"}`}
            >
              {t(key(x.label))}
            </button>
          );
        })}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-6">
        {tab === "android" && <AndroidTab />}
        {tab === "ios" && <IosTab />}
        {tab === "http" && <HttpTab />}
      </div>
    </section>
  );
}

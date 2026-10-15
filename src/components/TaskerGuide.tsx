import { useState, type ReactNode } from "react";
import { useT, type TKeyInput } from "../i18n";

// Integrations guide: Android (Tasker + NFC), iPhone (Shortcuts) and plain HTTP clients.
// All texts live in the `integrations` i18n namespace. Strings use a tiny inline markup:
// **bold** and `code`.

type Tab = "android" | "ios" | "http";
type Tone = "yellow" | "red";

/** Builds a typed i18n key from a dynamic "integrations.<name>" path. */
const key = (name: string) => `integrations.${name}` as TKeyInput;

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

/** Static description of a step: i18n key prefix, badge colour, how many list items, and optional extras. */
type StepDef = {
  id: string;
  bg: string;
  items: number;
  bullets?: boolean;
  intro?: boolean;
  outro?: boolean;
  tip?: Tone;
  /** Extra content shown after item `afterItem` (1-based). */
  extra?: { afterItem: number; node: (t: (k: TKeyInput, v?: Record<string, string | number>) => string) => ReactNode };
};

const HTTP_FIELD_COUNT = 6;
const VAR_KEYS: [string, string][] = [
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
  { id: "a0", bg: "bg-paper", items: 4, bullets: true },
  { id: "a1", bg: "bg-yellow", items: 3 },
  {
    id: "a2",
    bg: "bg-pink",
    items: 6,
    intro: true,
    tip: "yellow",
    extra: {
      afterItem: 2,
      node: (t) => (
        <>
          <dl className="grid grid-cols-1 border-2 border-line sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {Array.from({ length: HTTP_FIELD_COUNT }, (_, i) => i + 1).map((n) => (
              <div key={n} className="contents">
                <dt className="border-line px-3 pt-2 font-label text-sm text-paper-muted sm:border-b sm:pb-2">{t(key(`hf${n}_k`))}</dt>
                <dd className="border-b border-line px-3 pt-0.5 pb-2 text-[15px] sm:pt-2">
                  <Rich text={t(key(`hf${n}_v`))} />
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
  { id: "a3", bg: "bg-paper", items: 4, tip: "red" },
  { id: "a4", bg: "bg-yellow", items: 2, intro: true, outro: true },
  { id: "a5", bg: "bg-pink", items: 3 },
];

const IOS_STEPS: StepDef[] = [
  { id: "i0", bg: "bg-paper", items: 2, bullets: true },
  { id: "i1", bg: "bg-yellow", items: 5, tip: "yellow" },
  { id: "i2", bg: "bg-pink", items: 4 },
  { id: "i3", bg: "bg-paper", items: 2, bullets: true },
];

function StepList({ defs }: { defs: StepDef[] }) {
  const t = useT();
  return (
    <ol className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      {defs.map((d, idx) => {
        const items = Array.from({ length: d.items }, (_, i) => i + 1);
        const time = t(key(`${d.id}_time`));
        const List = d.bullets ? "ul" : "ol";
        return (
          <Step key={d.id} n={idx} bg={d.bg} title={t(key(`${d.id}_title`))} time={time}>
            {d.intro && (
              <p className="text-pretty">
                <Rich text={t(key(`${d.id}_intro`))} />
              </p>
            )}
            {d.bullets ? (
              <List className="flex list-['✓__'] flex-col gap-1.5 pl-6 marker:text-yellow">
                {items.map((n) => (
                  <li key={n}>
                    <Rich text={t(key(`${d.id}_i${n}`))} />
                  </li>
                ))}
              </List>
            ) : (
              <Sub>
                {items.map((n) => (
                  <li key={n}>
                    <Rich text={t(key(`${d.id}_i${n}`))} />
                    {d.extra?.afterItem === n && <div className="mt-2">{d.extra.node(t)}</div>}
                  </li>
                ))}
              </Sub>
            )}
            {d.outro && (
              <p className="text-[15px] text-pretty text-paper-muted">
                <Rich text={t(key(`${d.id}_outro`))} />
              </p>
            )}
            {d.tip && (
              <Tip tone={d.tip === "red" ? "red" : "yellow"}>
                <Rich text={t(key(`${d.id}_tip`))} />
                {d.id === "a2" && (
                  <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
                    {VAR_KEYS.map(([v, k]) => (
                      <span key={v} className="contents">
                        <code className="bg-coal px-1.5 py-px break-words text-yellow">{v}</code>
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

function Troubles({ prefix, count }: { prefix: string; count: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="lbl">{t("integrations.trouble_label")}</div>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <details key={n} className="group border-2 border-line open:border-paper">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 font-bold marker:hidden hover:bg-coal [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="font-label text-yellow group-open:rotate-90">
              ›
            </span>
            {t(key(`${prefix}${n}_q`))}
          </summary>
          <p className="px-4 pb-4 pl-10 leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
            <Rich text={t(key(`${prefix}${n}_a`))} />
          </p>
        </details>
      ))}
    </div>
  );
}

function Security({ tokenKey, variants }: { tokenKey: string; variants: string[] }) {
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
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
        <Rich text={t("integrations.android_intro")} />
      </p>
      <StepList defs={ANDROID_STEPS} />
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Troubles prefix="ta" count={8} />
        <Security tokenKey="android_sec_token" variants={["av1", "av2", "av3", "av4"]} />
      </div>
    </>
  );
}

function IosTab() {
  const t = useT();
  return (
    <>
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
        <Rich text={t("integrations.ios_intro")} />
      </p>
      <StepList defs={IOS_STEPS} />
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <Troubles prefix="ti" count={5} />
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
      <p className="max-w-[75ch] text-lg leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
        <Rich text={t("integrations.http_intro")} />
      </p>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3 border-t-2 border-line pt-5 leading-[1.5]">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{t("integrations.h1_title")}</h3>
          <ul className="flex list-['›__'] flex-col gap-1.5 pl-6 text-pretty marker:text-yellow">
            {["h1_i1", "h1_i2", "h1_i3"].map((k) => (
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

const TABS: { id: Tab; label: string }[] = [
  { id: "android", label: "integrations.tab_android" },
  { id: "ios", label: "integrations.tab_ios" },
  { id: "http", label: "integrations.tab_http" },
];

export default function TaskerGuide() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("android");
  return (
    <section className="flex flex-col gap-6 lg:col-span-2" aria-labelledby="tuto">
      <div className="flex flex-col gap-3">
        <h2 id="tuto" className="-rotate-1 self-start bg-yellow px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
          {t("integrations.guide_title")}
        </h2>
        <p className="max-w-[75ch] text-lg leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
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
              {t(x.label as TKeyInput)}
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

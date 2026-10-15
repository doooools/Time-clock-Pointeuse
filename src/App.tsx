import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { addDays, dayKey, formatClock } from "../shared/time";
import { normalizeLocale } from "../shared/settings";
import { cx, DayPickerButton, LangSwitch } from "./components/Widgets";
import { savedLocale, useLocale, useT, type TKey } from "./i18n";
import { api, type User } from "./lib/api";
import { longDate } from "./lib/dates";
import { StoreProvider, useNow, useStore, useTz } from "./lib/store";
import { useViewDay } from "./lib/viewDay";
import Dashboard from "./pages/Dashboard";
import DataPage from "./pages/DataPage";
import History from "./pages/History";
import Login from "./pages/Login";
import SettingsPage from "./pages/Settings";

// ECharts is heavy: the Stats tab is loaded on demand.
const Stats = lazy(() => import("./pages/Stats"));

const NAV: { to: string; label: TKey; short?: TKey; glyph: string }[] = [
  { to: "/", label: "common.navToday", glyph: "±" },
  { to: "/history", label: "common.navHistory", glyph: "≡" },
  { to: "/stats", label: "common.navStats", short: "common.navStatsShort", glyph: "▮▯" },
  { to: "/data", label: "common.navData", glyph: "⇅" },
  { to: "/settings", label: "common.navSettings", glyph: "⚙" },
];

/** Loading skeleton: tilted grey boxes. */
export function Loading() {
  const t = useT();
  return (
    <div className="flex flex-col gap-[18px] py-10" aria-busy="true">
      <div className="h-[26px] w-[220px] bg-coal" />
      <div className="flex flex-wrap items-end gap-2.5">
        {[-4, 2, -2, 3].map((r, i) => (
          <div key={i} className="h-24 w-[70px] bg-coal" style={{ transform: `rotate(${r}deg)` }} />
        ))}
        <span className="ml-[18px] font-label text-lg text-paper-muted">{t("common.loadingTagline")}</span>
      </div>
      <div className="h-[18px] w-full max-w-[420px] bg-coal" />
    </div>
  );
}

/** Date at the top right: click to pick the day shown on "Today". */
function HeaderDate() {
  const t = useT();
  const { locale } = useLocale();
  const now = useNow(1000);
  const tz = useTz();
  const today = dayKey(now, tz);
  const [day, setDay] = useViewDay(today);
  const shown = day ?? today;
  const arrow = "min-h-8 cursor-pointer px-1.5 text-paper-muted hover:text-yellow disabled:cursor-default disabled:text-grey";
  return (
    <div className="flex items-center gap-1 font-label text-base">
      <button className={arrow} aria-label={t("common.prevDay")} onClick={() => setDay(addDays(shown, -1))}>
        ‹
      </button>
      <DayPickerButton
        value={shown}
        max={today}
        onChange={setDay}
        label={t("common.pickDay")}
        className={cx(
          "px-2 py-0.5",
          day ? "-rotate-1 bg-yellow text-onpaper" : "text-paper-muted underline decoration-dotted underline-offset-4 hover:text-paper",
        )}
      >
        {longDate(locale, shown)}
        {!day && ` — ${formatClock(now, tz)}`} ▾
      </DayPickerButton>
      <button className={arrow} aria-label={t("common.nextDay")} disabled={!day} onClick={() => setDay(addDays(shown, 1))}>
        ›
      </button>
      {day && (
        <button className="ml-2 cursor-pointer text-paper-muted hover:text-yellow" onClick={() => setDay(null)}>
          {t("common.backToToday")}
        </button>
      )}
    </div>
  );
}

/** Signed-in account at the top right: name (to the settings) and sign-out. */
function AccountMenu() {
  const t = useT();
  const { user, logout, saveSettings } = useStore();
  return (
    <div className="flex items-center gap-4 font-label text-sm">
      <LangSwitch onChange={(locale) => saveSettings({ locale }, { quiet: true }).catch(() => {})} />
      <NavLink to="/settings" className="max-w-[200px] truncate text-paper-muted hover:text-yellow" title={t("common.accountSettings")}>
        {user.displayName || user.username}
      </NavLink>
      <button type="button" className="min-h-8 cursor-pointer text-paper-muted hover:text-red-text" onClick={() => logout()}>
        {t("common.logout")}
      </button>
    </div>
  );
}

function Shell() {
  const t = useT();
  const { loading } = useStore();
  return (
    <div className="min-h-dvh">
      {/* Desktop header */}
      <header className="mx-auto hidden max-w-[1600px] items-center justify-between px-10 pt-[30px] lg:flex">
        <div className="flex items-center gap-7">
          <NavLink to="/" className="-rotate-2 bg-paper px-3.5 py-0.5 font-display text-[34px] tracking-[.02em] text-onpaper">
            {t("common.brand")}
          </NavLink>
          <nav className="flex gap-[22px] font-label text-base">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive ? "text-yellow underline decoration-[3px] underline-offset-4" : "text-paper-muted hover:text-paper"
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-8">
          <HeaderDate />
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-[18px] pb-[100px] lg:px-10 lg:pb-16">
        {loading ? (
          <Loading />
        ) : (
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/history" element={<History />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-[3px] border-onpaper bg-paper pb-[env(safe-area-inset-bottom)] font-label text-xs text-onpaper lg:hidden">
        {NAV.map(({ to, label, short, glyph }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex h-[68px] flex-col items-center justify-center gap-[3px] ${isActive ? "bg-yellow" : ""}`
            }
          >
            <b aria-hidden className="font-display text-lg font-normal">
              {glyph}
            </b>
            {t(short ?? label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const { setLocale } = useLocale();
  // undefined = checking the session, null = signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const checkSession = useCallback(
    () =>
      api
        .me()
        .then((r) => {
          if (r.authenticated) {
            // Switch to the account language right away, before /api/data.
            const locale = normalizeLocale(r.locale);
            if (locale) setLocale(locale);
            setUser(r.user);
          } else {
            // Before sign-in: the language chosen on this device, else the instance default, else the browser.
            const locale = normalizeLocale(r.defaultLocale);
            if (!savedLocale() && locale) setLocale(locale, { persist: false });
            setUser(null);
          }
        })
        .catch(() => setUser(null)),
    [setLocale],
  );

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const onUnauthorized = useCallback(() => setUser(null), []);

  if (user === undefined)
    return (
      <div className="px-[18px] lg:px-10">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <Login onSuccess={checkSession} />
    );
  return (
    <StoreProvider key={user.id} user={user} onUnauthorized={onUnauthorized}>
      <Shell />
    </StoreProvider>
  );
}

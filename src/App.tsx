import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useMatch } from "react-router-dom";
import { addDays, dayKey, formatClock } from "../shared/time";
import { normalizeLocale, type Locale } from "../shared/settings";
import { NotificationsModal } from "./components/NotificationsModal";
import { cx, DayPickerButton, LangSwitch } from "./components/Widgets";
import { savedLocale, useLocale, useT, type TKey } from "./i18n";
import { api, userLabel, type CurrentUser } from "./lib/api";
import { dayLabel, longDate } from "./lib/dates";
import { MeProvider, showsTeam, useMe, withCapabilities } from "./lib/me";
import { StoreProvider, teamPath, useNow, useStore, useTz } from "./lib/store";
import { useViewDay } from "./lib/viewDay";
import Dashboard from "./pages/Dashboard";
import DataPage from "./pages/DataPage";
import History from "./pages/History";
import Login from "./pages/Login";
import SettingsPage from "./pages/Settings";

// ECharts is heavy: the Stats tab is loaded on demand. Team pages are only used by some accounts.
const Stats = lazy(() => import("./pages/Stats"));
const Team = lazy(() => import("./pages/Team"));
const Journal = lazy(() => import("./pages/Journal"));

type NavItem = {
  to: string;
  label: TKey;
  /** Mobile tab bar label. */
  short?: TKey;
  /** Mobile label when the bar has more than five tabs (Team shown). */
  tight?: TKey;
  glyph: string;
};

const NAV: NavItem[] = [
  { to: "/", label: "common.navToday", tight: "common.navTodayTight", glyph: "±" },
  { to: "/history", label: "common.navHistory", tight: "common.navHistoryTight", glyph: "≡" },
  { to: "/stats", label: "common.navStats", short: "common.navStatsShort", glyph: "▮▯" },
  { to: "/data", label: "common.navData", glyph: "⇅" },
];
// When the account may see or manage other accounts (C12). The journal is linked from the Team and Settings pages.
const TEAM_NAV: NavItem[] = [{ to: "/team", label: "common.navTeam", glyph: "∴" }];
const SETTINGS_NAV: NavItem = { to: "/settings", label: "common.navSettings", glyph: "⚙" };

function useNav(): NavItem[] {
  const me = useMe();
  return [...NAV, ...(showsTeam(me.capabilities) ? TEAM_NAV : []), SETTINGS_NAV];
}

/** Only "/" needs an exact match; "/team" stays active on a member's views. */
const exactNav = (to: string) => to === "/";

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
    <div className="flex items-center gap-1 font-label text-base whitespace-nowrap">
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
        {/* Narrower desktops: short date, and the clock only on wide screens. */}
        <span className="hidden xl:inline">{longDate(locale, shown)}</span>
        <span className="xl:hidden">{dayLabel(locale, shown)}</span>
        {!day && <span className="hidden 2xl:inline">{` — ${formatClock(now, tz)}`}</span>} ▾
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
  const me = useMe();
  const { setLocale } = useLocale();
  const { subject, logout, saveSettings } = useStore();
  const changeLocale = (locale: Locale) => {
    if (subject.isMe) return void saveSettings({ locale }, { quiet: true }).catch(() => {});
    // Viewing a member: the store holds their settings, so mine are saved directly.
    setLocale(locale);
    api.saveSettings({ locale }).catch(() => {});
  };
  return (
    <div className="flex items-center gap-3 font-label text-sm xl:gap-4">
      {/* Both stay reachable from the Settings page when the header is short of room. */}
      <span className="hidden xl:block">
        <LangSwitch onChange={changeLocale} />
      </span>
      <NavLink to="/settings" className="hidden max-w-[200px] truncate text-paper-muted hover:text-yellow 2xl:block" title={t("common.accountSettings")}>
        {userLabel(me)}
      </NavLink>
      <button type="button" className="min-h-8 cursor-pointer text-paper-muted hover:text-red-text" onClick={() => logout()}>
        {t("common.logout")}
      </button>
    </div>
  );
}

/** Banner of a member's views: whose hours these are, their tabs, read only or not, and the way back. */
function SubjectBanner() {
  const t = useT();
  const { subject, canEdit, failed, loading, path } = useStore();
  const tabs: { to: string; label: TKey }[] = [
    { to: "/", label: "common.navToday" },
    { to: "/history", label: "common.navHistory" },
    { to: "/stats", label: "common.navStats" },
  ];
  // Until loaded, the store does not know the member's name yet.
  const name = loading ? (failed ? `#${subject.id}` : "…") : subject.displayName || `#${subject.id}`;
  return (
    <section aria-label={t("common.subjectViewing", { name })} className="mt-4 mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-[3px] border-yellow px-4 py-3 lg:mt-6">
      <Link to="/team" className="font-label text-sm text-paper-muted hover:text-yellow">
        {t("common.subjectBack")}
      </Link>
      <p className="-rotate-1 bg-yellow px-2.5 py-0.5 font-display text-xl text-onpaper">{t("common.subjectViewing", { name })}</p>
      {!loading && !failed && (
        <>
          <nav className="flex gap-4 font-label text-sm">
            {tabs.map(({ to, label }) => (
              <NavLink
                key={to}
                to={path(to)}
                end
                className={({ isActive }) =>
                  isActive ? "text-yellow underline decoration-[3px] underline-offset-4" : "text-paper-muted hover:text-paper"
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>
          <span className={cx("font-label text-sm", canEdit ? "text-yellow" : "text-paper-muted")}>
            {canEdit ? t("common.subjectCanEdit", { name }) : t("common.subjectReadOnly")}
          </span>
          <Link
            to={`/journal?userId=${subject.id}`}
            className="font-label text-sm text-paper-muted underline decoration-dotted underline-offset-4 hover:text-yellow"
          >
            {t("common.subjectJournal")}
          </Link>
        </>
      )}
    </section>
  );
}

/** The first load failed: explanation and a retry. */
function LoadFailed() {
  const t = useT();
  const { subject, refresh } = useStore();
  return (
    <div className="flex flex-col items-start gap-3 py-10" role="alert">
      <p className="font-label text-lg text-red-text">{t(subject.isMe ? "common.loadFailed" : "common.subjectLoadFailed")}</p>
      <button type="button" className="btn-secondary px-3.5 py-2" onClick={() => refresh().catch(() => {})}>
        {t("common.retry")}
      </button>
    </div>
  );
}

function Shell() {
  const t = useT();
  const { loading, failed, subject } = useStore();
  const nav = useNav();
  return (
    <div className="min-h-dvh">
      {/* Desktop header */}
      <header className="mx-auto hidden max-w-[1600px] items-center justify-between px-10 pt-[30px] lg:flex">
        <div className="flex items-center gap-5 xl:gap-7">
          <NavLink to="/" className="-rotate-2 bg-paper px-3.5 py-0.5 font-display text-[34px] tracking-[.02em] text-onpaper">
            {t("common.brand")}
          </NavLink>
          <nav className="flex gap-4 font-label text-sm whitespace-nowrap xl:gap-[22px] xl:text-base">
            {nav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={exactNav(to)}
                className={({ isActive }) =>
                  isActive ? "text-yellow underline decoration-[3px] underline-offset-4" : "text-paper-muted hover:text-paper"
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5 xl:gap-8">
          <HeaderDate />
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-[18px] pb-[100px] lg:px-10 lg:pb-16">
        {!subject.isMe && <SubjectBanner />}
        {loading && failed ? (
          <LoadFailed />
        ) : loading ? (
          <Loading />
        ) : (
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/history" element={<History />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/team" element={<Team />} />
              <Route path="/journal" element={<Journal />} />
              {/* A member's views: the store holds their data (see Main). */}
              <Route path="/team/:id" element={<Dashboard />} />
              <Route path="/team/:id/history" element={<History />} />
              <Route path="/team/:id/stats" element={<Stats />} />
              <Route path="/team/:id/*" element={<Navigate to={teamPath(subject.id)} replace />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {/* Mobile tab bar */}
      <nav
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-40 grid border-t-[3px] border-onpaper bg-paper pb-[env(safe-area-inset-bottom)] font-label text-[11px] min-[400px]:text-xs text-onpaper lg:hidden">
        {nav.map(({ to, label, short, tight, glyph }) => (
          <NavLink
            key={to}
            to={to}
            end={exactNav(to)}
            className={({ isActive }) =>
              `flex h-[68px] min-w-0 flex-col items-center justify-center gap-[3px] px-0.5 ${isActive ? "bg-yellow" : ""}`
            }
          >
            <b aria-hidden className="font-display text-lg font-normal">
              {glyph}
            </b>
            {t((nav.length > 5 && tight) || short || label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Member id of a `/team/:id/…` URL: a number, "invalid", or null outside the member views. */
function useSubjectId(): number | "invalid" | null {
  const match = useMatch("/team/:id/*");
  const raw = match?.params.id;
  if (raw === undefined) return null;
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : "invalid";
}

/** My store is always mounted; a member's view nests a second store (their data) around the shell. */
function Main({ onUnauthorized }: { onUnauthorized: () => void }) {
  const me = useMe();
  const subjectId = useSubjectId();
  const { pathname, search } = useLocation();
  // No right on the team at all: /team and /team/:id lead nowhere, go home silently.
  if ((pathname === "/team" || pathname.startsWith("/team/")) && !showsTeam(me.capabilities)) return <Navigate to="/" replace />;
  if (subjectId === "invalid") return <Navigate to="/team" replace />;
  // My own id in a member URL: the same page on my data.
  if (subjectId === me.id) return <Navigate to={(pathname.replace(/^\/team\/\d+/, "") || "/") + search} replace />;
  return (
    <>
      {subjectId === null ? (
        <Shell />
      ) : (
        <StoreProvider key={subjectId} subjectId={subjectId} onUnauthorized={onUnauthorized}>
          <Shell />
        </StoreProvider>
      )}
      <NotificationsModal />
    </>
  );
}

export default function App() {
  const { setLocale } = useLocale();
  // undefined = checking the session, null = signed out.
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  const checkSession = useCallback(
    () =>
      api
        .me()
        .then((r) => {
          if (r.authenticated) {
            // Switch to the account language right away, before /api/data.
            const locale = normalizeLocale(r.locale);
            if (locale) setLocale(locale);
            setUser(withCapabilities(r.user));
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

  // Rights can change while the app is open (an admin edits my account): reload them without touching the language.
  const refreshMe = useCallback(
    () =>
      api
        .me()
        .then((r) => setUser(r.authenticated ? withCapabilities(r.user) : null))
        .catch(() => {}),
    [],
  );
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => document.visibilityState === "visible" && refreshMe();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, refreshMe]);

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
    <MeProvider key={user.id} me={user} refreshMe={refreshMe}>
      <StoreProvider onUnauthorized={onUnauthorized}>
        <Main onUnauthorized={onUnauthorized} />
      </StoreProvider>
    </MeProvider>
  );
}

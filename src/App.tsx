import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { addDays, dayKey, formatClock, weekday } from "../shared/time";
import { cx, DayPickerButton } from "./components/Widgets";
import { api } from "./lib/api";
import { longDate } from "./lib/dates";
import { StoreProvider, useNow, useStore } from "./lib/store";
import { useViewDay } from "./lib/viewDay";
import Dashboard from "./pages/Dashboard";
import DataPage from "./pages/DataPage";
import History from "./pages/History";
import Login from "./pages/Login";
import SettingsPage from "./pages/Settings";

// ECharts est lourd : l'onglet Stats est chargé à la demande.
const Stats = lazy(() => import("./pages/Stats"));

const NAV = [
  { to: "/", label: "aujourd'hui", glyph: "±" },
  { to: "/historique", label: "historique", glyph: "≡" },
  { to: "/stats", label: "statistiques", short: "stats", glyph: "▮▯" },
  { to: "/donnees", label: "données", glyph: "⇅" },
  { to: "/reglages", label: "réglages", glyph: "⚙" },
];

/** Squelette de chargement : cases grises de travers. */
export function Loading() {
  return (
    <div className="flex flex-col gap-[18px] py-10" aria-busy="true">
      <div className="h-[26px] w-[220px] bg-[oklch(0.22_0_0)]" />
      <div className="flex flex-wrap items-end gap-2.5">
        {[-4, 2, -2, 3].map((r, i) => (
          <div key={i} className="h-24 w-[70px] bg-[oklch(0.21_0_0)]" style={{ transform: `rotate(${r}deg)` }} />
        ))}
        <span className="ml-[18px] font-label text-lg text-paper-muted">on photocopie vos heures…</span>
      </div>
      <div className="h-[18px] w-full max-w-[420px] bg-coal" />
    </div>
  );
}

/** Date en haut à droite : cliquable pour choisir le jour affiché dans « Aujourd'hui ». */
function HeaderDate() {
  const now = useNow(1000);
  const today = dayKey(now);
  const [day, setDay] = useViewDay(today);
  const shown = day ?? today;
  const arrow = "min-h-8 cursor-pointer px-1.5 text-paper-muted hover:text-yellow disabled:cursor-default disabled:text-grey";
  return (
    <div className="flex items-center gap-1 font-label text-base">
      <button className={arrow} aria-label="Jour précédent" onClick={() => setDay(addDays(shown, -1))}>
        ‹
      </button>
      <DayPickerButton
        value={shown}
        max={today}
        onChange={setDay}
        label="Choisir le jour à afficher"
        className={cx(
          "px-2 py-0.5",
          day ? "-rotate-1 bg-yellow text-onpaper" : "text-paper-muted underline decoration-dotted underline-offset-4 hover:text-paper",
        )}
      >
        {longDate(shown, weekday(shown))}
        {!day && ` — ${formatClock(now)}`} ▾
      </DayPickerButton>
      <button className={arrow} aria-label="Jour suivant" disabled={!day} onClick={() => setDay(addDays(shown, 1))}>
        ›
      </button>
      {day && (
        <button className="ml-2 cursor-pointer text-paper-muted hover:text-yellow" onClick={() => setDay(null)}>
          ✕ aujourd'hui
        </button>
      )}
    </div>
  );
}

function Shell() {
  const { loading, readOnly } = useStore();
  return (
    <div className="min-h-dvh">
      {readOnly && (
        <div className="bg-yellow px-[18px] py-1 text-center font-label text-sm text-onpaper">
          LECTURE SEULE · consultation sans modification possible
        </div>
      )}
      {/* En-tête bureau */}
      <header className="mx-auto hidden max-w-[1600px] items-center justify-between px-10 pt-[30px] lg:flex">
        <div className="flex items-center gap-7">
          <NavLink to="/" className="-rotate-2 bg-paper px-3.5 py-0.5 font-display text-[34px] tracking-[.02em] text-onpaper">
            LA POINTEUSE
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
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <HeaderDate />
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-[18px] pb-[100px] lg:px-10 lg:pb-16">
        {loading ? (
          <Loading />
        ) : (
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/historique" element={<History />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/donnees" element={<DataPage />} />
              <Route path="/reglages" element={<SettingsPage />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {/* Barre d'onglets mobile */}
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
            {short ?? label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setAuth(r.authenticated);
        setReadOnly(r.readOnly);
      })
      .catch(() => setAuth(false));
  }, []);

  const onUnauthorized = useCallback(() => setAuth(false), []);

  if (auth === null)
    return (
      <div className="px-[18px] lg:px-10">
        <Loading />
      </div>
    );
  if (!auth) return <Login
        onSuccess={(ro) => {
          setReadOnly(ro);
          setAuth(true);
        }}
      />;
  return (
    <StoreProvider onUnauthorized={onUnauthorized} readOnly={readOnly}>
      <Shell />
    </StoreProvider>
  );
}

import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { dayKey } from "../../shared/time";

const dayPath = (d: string | null, today: string) => (!d || d >= today ? "/" : `/?jour=${d}`);

/**
 * Jour affiché dans « Aujourd'hui » (`/?jour=YYYY-MM-DD`) ; `null` = aujourd'hui, en direct.
 * Choisir un jour depuis un autre onglet ramène sur « Aujourd'hui ».
 */
export function useViewDay(today: string): [string | null, (day: string | null) => void] {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const raw = pathname === "/" ? params.get("jour") : null;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw < today ? raw : null;
  const setDay = (d: string | null) => navigate(dayPath(d, today));
  return [day, setDay];
}

/** Ouvre un jour dans « Aujourd'hui », comme depuis le sélecteur de l'en-tête (et remonte en haut de page). */
export function useOpenDay(): (day: string) => void {
  const navigate = useNavigate();
  return (d) => {
    navigate(dayPath(d, dayKey(Date.now())));
    window.scrollTo({ top: 0 });
  };
}

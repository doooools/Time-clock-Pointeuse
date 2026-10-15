import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { dayKey } from "../../shared/time";

const dayPath = (d: string | null, today: string) => (!d || d >= today ? "/" : `/?jour=${d}`);

/**
 * Day shown on the "Today" page (`/?jour=YYYY-MM-DD`); `null` = today, live.
 * Picking a day from another tab brings you back to "Today".
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

/** Opens a day on the "Today" page, like the header picker does (and scrolls to the top). */
export function useOpenDay(): (day: string) => void {
  const navigate = useNavigate();
  return (d) => {
    navigate(dayPath(d, dayKey(Date.now())));
    window.scrollTo({ top: 0 });
  };
}

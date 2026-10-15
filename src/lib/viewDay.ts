import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { dayKey, isValidDayKey } from "../../shared/time";
import { useTz } from "./store";

const dayPath = (d: string | null, today: string) => (!d || d >= today ? "/" : `/?day=${d}`);

/**
 * Day shown on the "Today" page (`/?day=YYYY-MM-DD`); `null` = today, live.
 * Picking a day from another tab brings you back to "Today".
 */
export function useViewDay(today: string): [string | null, (day: string | null) => void] {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const raw = pathname === "/" ? params.get("day") : null;
  const day = raw && isValidDayKey(raw) && raw < today ? raw : null;
  const setDay = (d: string | null) => navigate(dayPath(d, today));
  return [day, setDay];
}

/** Opens a day on the "Today" page, like the header picker does (and scrolls to the top). */
export function useOpenDay(): (day: string) => void {
  const navigate = useNavigate();
  const tz = useTz();
  return (d) => {
    navigate(dayPath(d, dayKey(Date.now(), tz)));
    window.scrollTo({ top: 0 });
  };
}

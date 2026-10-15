import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { dayKey, isValidDayKey } from "../../shared/time";
import { useStore } from "./store";

/** "Today" page of the subject (`/` or `/team/:id`), on a past day or live. */
const dayPath = (home: string, d: string | null, today: string) => (!d || d >= today ? home : `${home}?day=${d}`);

/**
 * Day shown on the "Today" page (`?day=YYYY-MM-DD`); `null` = today, live.
 * Picking a day from another tab brings you back to "Today" (of the same subject).
 */
export function useViewDay(today: string): [string | null, (day: string | null) => void] {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const home = useStore().path("/");
  const raw = pathname === home ? params.get("day") : null;
  const day = raw && isValidDayKey(raw) && raw < today ? raw : null;
  const setDay = (d: string | null) => navigate(dayPath(home, d, today));
  return [day, setDay];
}

/** Opens a day on the "Today" page, like the header picker does (and scrolls to the top). */
export function useOpenDay(): (day: string) => void {
  const navigate = useNavigate();
  const { path, settings } = useStore();
  return (d) => {
    navigate(dayPath(path("/"), d, dayKey(Date.now(), settings.timezone)));
    window.scrollTo({ top: 0 });
  };
}

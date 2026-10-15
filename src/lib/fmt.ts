// Formats d'affichage de l'interface : vrai signe moins (U+2212), zéro en « +0h00 ».
import { fmtDuration, fmtDurationLive } from "../../shared/format";

export const MINUS = "−";

/** Signe arrondi à la minute : 1, -1 ou 0. */
export function signOf(min: number): 1 | -1 | 0 {
  const r = Math.round(min);
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

/** "7h18" (valeur absolue si `abs`) */
export function dur(min: number): string {
  return fmtDuration(min).replace("-", MINUS);
}

/** "5h01:37" */
export function durLive(min: number): string {
  return fmtDurationLive(min).replace("-", MINUS);
}

/** "+1h03" / "−0h26" / "+0h00" */
export function signed(min: number): string {
  return `${signOf(min) < 0 ? MINUS : "+"}${fmtDuration(Math.abs(min))}`;
}

/** "08:33" depuis des minutes depuis minuit */
export function hmOfMinutes(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Durée écoulée lisible pour « dans 2h17 ». */
export function inDur(min: number): string {
  return dur(Math.max(0, min));
}

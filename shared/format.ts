// Duration formatting (minutes), identical in every locale: 438 → "7h18", -63 → "-1h03".

export function fmtDuration(min: number): string {
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${min < 0 && total > 0 ? "-" : ""}${h}h${String(m).padStart(2, "0")}`;
}

export function fmtSigned(min: number): string {
  const total = Math.round(Math.abs(min));
  if (total === 0) return "±0h00";
  return `${min < 0 ? "-" : "+"}${fmtDuration(Math.abs(min))}`;
}

/** Duration with seconds for live counters: "3h41:07". */
export function fmtDurationLive(min: number): string {
  const secs = Math.floor(Math.abs(min) * 60);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${min < 0 && secs > 0 ? "-" : ""}${h}h${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Decimal hours for exports: 438 → 7.3 */
export function toHoursDecimal(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

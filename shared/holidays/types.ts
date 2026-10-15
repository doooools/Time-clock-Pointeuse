/** Holidays of one region for one year, as [YYYY-MM-DD, local name] pairs. */
export type HolidayProvider = (year: number) => Array<[date: string, name: string]>;

export type HolidayRegion = {
  /** Registry key, e.g. "FR", "FR-AM", "BE", "CH", "US". Upper case, ISO 3166 style. */
  code: string;
  /** English display name, e.g. "France (Alsace-Moselle)". */
  name: string;
  provider: HolidayProvider;
};

# Public holiday regions

Each region is one file `<code-lowercase>.ts` exporting `region: HolidayRegion` (see `types.ts`), registered in
`index.ts`. A user picks a region with `settings.holidays` (e.g. `"FR"`, `"CA-QC"`, or `"none"`).

## Available regions

| Code | Region | Names in | Notes |
|---|---|---|---|
| `FR` | France (metropolitan) | French | |
| `FR-AM` | France (Alsace-Moselle) | French | `FR` + Good Friday + 26 December |
| `BE` | Belgium | French | national legal holidays; community holidays excluded |
| `LU` | Luxembourg | French | includes Europe Day (since 2019) |
| `CH` | Switzerland | French | common set only; **cantons vary**, use manual marks for the rest |
| `CA` | Canada (federal) | English | Canada Labour Code list; no weekend shifting |
| `CA-QC` | Québec | French | Good Friday variant (employers may choose Easter Monday) |
| `DE` | Germany | German | nationwide only; Länder holidays excluded |
| `GB-ENG` | England and Wales | English | bank holidays with substitute days |
| `US` | United States (federal) | English | weekend holidays listed on their observed weekday |
| `ES` | Spain | Spanish | national only; regional holidays and Sunday shifting excluded |
| `IT` | Italy | Italian | includes Easter Sunday; local patron-saint days excluded |
| `NL` | Netherlands | Dutch | Bevrijdingsdag only in years divisible by 5; no Good Friday |
| `PT` | Portugal | Portuguese | four holidays suspended 2013–2015; municipal days excluded |

## Limitations

- **One-off holidays are not handled**: jubilees, coronations, funerals, extra bank holidays announced for a single
  year, etc. Mark those days manually (`holiday` day mark) in the app.
- Regional/local holidays are only covered where a region code exists above.
- Rules are encoded for a reasonable range of years around today (checked for 2025–2027). Check the official source
  again before relying on far-future years, since laws change.

## Adding a region

1. Create `shared/holidays/<code>.ts` (lowercase code, `-` for subdivisions, e.g. `ch-ge.ts`). Return dates sorted,
   names in the local language, and cite the official source in a comment. Helpers: `addDays`, `makeDayKey`
   (`../time`), `easterSunday` (`./easter`), and `nthWeekday`, `lastWeekday`, `mondayBefore`, `isoWeekday`, `sorted`
   (`./calendar`).

   ```ts
   import type { HolidayRegion } from "./types";
   import { makeDayKey } from "../time";

   /** Example: a country with a single holiday. Source: <official URL or law>. */
   export const region: HolidayRegion = {
     code: "XX",
     name: "Examplestan",
     provider: (year) => [[makeDayKey(year, 1, 1), "New Year"]],
   };
   ```

2. Create `shared/holidays/<code>.test.ts` checking every date of at least 2025, 2026 and 2027 against an official
   source (quote it in a comment). Copy any existing test as a template, and add tests for weekend-shifting rules.
3. Register it in `index.ts`: import `region as xx` and add it to `HOLIDAY_REGIONS` (sorted by code).
4. Run `npx vitest run shared/holidays`.

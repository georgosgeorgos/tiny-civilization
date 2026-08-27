export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
export type Season = (typeof SEASONS)[number];

export const SECONDS_PER_DAY = 28;
export const DAYS_PER_SEASON = 3;
export const DAYS_PER_YEAR = SEASONS.length * DAYS_PER_SEASON;
export const YEAR_SECONDS = DAYS_PER_YEAR * SECONDS_PER_DAY;

export const SPEED_STEPS = [0, 1, 2, 4, 8] as const;

export type TimeOfDay = "Night" | "Dawn" | "Morning" | "Midday" | "Afternoon" | "Dusk";

export function seasonFromDays(simDays: number): Season {
  const day = Math.floor(positiveMod(simDays, DAYS_PER_YEAR));
  return SEASONS[Math.floor(day / DAYS_PER_SEASON)] ?? "Spring";
}

export function yearFromDays(simDays: number): number {
  return Math.floor(simDays / DAYS_PER_YEAR) + 1;
}

export function hourFromDays(simDays: number): number {
  return positiveMod(simDays, 1) * 24;
}

export function dayOfSeason(simDays: number): number {
  const day = Math.floor(positiveMod(simDays, DAYS_PER_YEAR));
  return (day % DAYS_PER_SEASON) + 1;
}

export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 5 || hour >= 21) return "Night";
  if (hour < 7) return "Dawn";
  if (hour < 11) return "Morning";
  if (hour < 14) return "Midday";
  if (hour < 18) return "Afternoon";
  return "Dusk";
}

export function isNight(hour: number): boolean {
  return hour >= 19.5 || hour < 6;
}

export function daylight(hour: number): number {
  const wave = Math.sin(((hour - 6) / 12) * Math.PI);
  return clamp(wave, 0, 1);
}

export function farmSeasonYield(season: Season): number {
  if (season === "Summer") return 1.35;
  if (season === "Spring") return 1;
  if (season === "Autumn") return 0.85;
  return 0.12;
}

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

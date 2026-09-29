export interface Person {
  id: string;
  name: string;
  isStudent: boolean;
  color: string;
  order: number;
  vacationDays: number;
  heiligabendHalf: boolean;
  silvesterHalf: boolean;
}

export interface Vacation {
  id: string;
  personId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  note: string | null;
  person?: Person;
}

export type ViewMode = "month" | "quarter" | "halfyear" | "year";

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  month: "Monat",
  quarter: "Quartal",
  halfyear: "Halbjahr",
  year: "Jahr",
};

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const PERSON_COLOR_VARS = [
  "var(--p0)",
  "var(--p1)",
  "var(--p2)",
  "var(--p3)",
  "var(--p4)",
  "var(--p5)",
  "var(--p6)",
  "var(--p7)",
  "var(--p8)",
  "var(--p9)",
];

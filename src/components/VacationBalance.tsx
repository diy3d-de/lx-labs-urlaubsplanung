"use client";

import { useMemo } from "react";
import type { Person, Vacation } from "@/lib/types";
import type { PublicHoliday } from "@/lib/holidays";
import { countVacationDays } from "@/lib/vacationDays";

function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function VacationBalance({
  personen,
  urlaube,
  feiertage,
  year,
}: {
  personen: Person[];
  urlaube: Vacation[];
  feiertage: PublicHoliday[];
  year: number;
}) {
  const holidayDates = useMemo(() => new Set(feiertage.map((h) => h.date)), [feiertage]);

  const rows = useMemo(() => {
    return personen
      .filter((p) => !p.isStudent)
      .map((p) => {
        const geplant = urlaube
          .filter((v) => v.personId === p.id)
          .reduce((sum, v) => sum + countVacationDays(v, p, holidayDates), 0);
        return {
          person: p,
          anspruch: p.vacationDays,
          geplant,
          rest: p.vacationDays - geplant,
        };
      });
  }, [personen, urlaube, holidayDates]);

  if (rows.length === 0) return null;

  return (
    <div className="no-print rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        Urlaubskonto {year}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[var(--text-faint)]">
              <th className="pb-1.5 pr-3 font-medium">Person</th>
              <th className="pb-1.5 pr-3 text-right font-medium">Verfügbar</th>
              <th className="pb-1.5 pr-3 text-right font-medium">Geplant</th>
              <th className="pb-1.5 text-right font-medium">Übrig</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, anspruch, geplant, rest }) => (
              <tr key={person.id} className="border-t border-[var(--border-soft)]">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: person.color }} />
                    {person.name}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--text)]">
                  {formatDays(anspruch)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--text)]">
                  {formatDays(geplant)}
                </td>
                <td
                  className="py-1.5 text-right tabular-nums font-medium"
                  style={{ color: rest < 0 ? "var(--danger)" : "var(--text)" }}
                >
                  {formatDays(rest)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

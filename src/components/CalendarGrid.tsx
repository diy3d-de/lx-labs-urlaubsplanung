"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, getISOWeek, isWeekend } from "date-fns";
import { de } from "date-fns/locale";
import type { Person, Vacation } from "@/lib/types";
import { personInitials } from "@/lib/types";
import type { PublicHoliday, SchoolHolidayPeriod } from "@/lib/holidays";
import { daysOfMonth, formatLocalDate, monthsInRange, parseLocalDate } from "@/lib/dateRange";
import { isCountableVacationDay, isHalfDay } from "@/lib/vacationDays";

type Density = "wide" | "medium" | "narrow" | "compact";

const DENSITY_BY_MONTHS: Record<number, Density> = { 1: "wide", 3: "medium", 6: "narrow", 12: "compact" };
const COLUMN_MIN_WIDTH: Record<Density, number> = { wide: 280, medium: 210, narrow: 155, compact: 118 };
const ROW_HEIGHT: Record<Density, number> = { wide: 30, medium: 27, narrow: 25, compact: 20 };
const MAX_BADGES: Record<Density, number> = { wide: 8, medium: 5, narrow: 3, compact: 2 };
const KW_WIDTH: Record<Density, number> = { wide: 30, medium: 28, narrow: 26, compact: 0 };

export default function CalendarGrid({
  start,
  end,
  personen,
  urlaube,
  feiertage,
  ferien,
  onDayClick,
  onVacationClick,
}: {
  viewMode: string;
  start: Date;
  end: Date;
  personen: Person[];
  urlaube: Vacation[];
  feiertage: PublicHoliday[];
  ferien: SchoolHolidayPeriod[];
  onDayClick: (start: Date, end: Date) => void;
  onVacationClick: (vacation: Vacation) => void;
  onPersonClick?: (person: Person) => void;
}) {
  const months = useMemo(() => monthsInRange(start, end), [start, end]);
  const density = DENSITY_BY_MONTHS[months.length] ?? "narrow";
  const colWidth = COLUMN_MIN_WIDTH[density];
  const rowH = ROW_HEIGHT[density];
  const maxBadges = MAX_BADGES[density];
  const kwWidth = KW_WIDTH[density];
  const showKw = kwWidth > 0;
  const showText = months.length <= 3;

  const holidayMap = useMemo(() => new Map(feiertage.map((h) => [h.date, h])), [feiertage]);

  const ferienForDate = useMemo(() => {
    return (dateKey: string) => ferien.find((f) => dateKey >= f.start && dateKey <= f.end) ?? null;
  }, [ferien]);

  const personById = useMemo(() => new Map(personen.map((p) => [p.id, p])), [personen]);

  const holidayDates = useMemo(() => new Set(feiertage.map((h) => h.date)), [feiertage]);

  const vacationsByDate = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    for (const v of urlaube) {
      const vStart = parseLocalDate(v.startDate);
      const vEnd = parseLocalDate(v.endDate);
      const from = vStart < start ? start : vStart;
      const to = vEnd > end ? end : vEnd;
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (!isCountableVacationDay(d, holidayDates)) continue;
        const key = formatLocalDate(d);
        const list = map.get(key) ?? [];
        list.push(v);
        map.set(key, list);
      }
    }
    return map;
  }, [urlaube, start, end, holidayDates]);

  const maxDays = Math.max(...months.map((m) => daysOfMonth(m).length));

  // Tage per Ziehen auswählen (Mehrtages-Zeitraum)
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragCurrent, setDragCurrent] = useState<string | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!dragAnchor) return;
    function finish() {
      if (isDragging.current && dragAnchor && dragCurrent) {
        const lo = dragAnchor < dragCurrent ? dragAnchor : dragCurrent;
        const hi = dragAnchor < dragCurrent ? dragCurrent : dragAnchor;
        onDayClick(parseLocalDate(lo), parseLocalDate(hi));
      }
      isDragging.current = false;
      setDragAnchor(null);
      setDragCurrent(null);
    }
    window.addEventListener("mouseup", finish);
    return () => window.removeEventListener("mouseup", finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragAnchor, dragCurrent]);

  const selRange = useMemo(() => {
    if (!dragAnchor || !dragCurrent) return null;
    return dragAnchor < dragCurrent ? [dragAnchor, dragCurrent] : [dragCurrent, dragAnchor];
  }, [dragAnchor, dragCurrent]);

  // Popover für Tage mit mehr Personen als sichtbaren Badge-Plätzen
  const [overflowKey, setOverflowKey] = useState<string | null>(null);

  // Jahresansicht: Monate gleichmäßig auf die verfügbare Breite verteilen,
  // statt eine Mindestbreite zu erzwingen – so ist der ganze Jahresüberblick
  // ohne horizontales Scrollen sichtbar.
  const fitToWidth = density === "compact";

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 select-none">
      <div
        className={`flex ${fitToWidth ? "gap-1" : "gap-2"}`}
        style={fitToWidth ? undefined : { minWidth: months.length * colWidth }}
      >
        {months.map((monthStart) => {
          const days = daysOfMonth(monthStart);
          return (
            <div
              key={monthStart.toISOString()}
              className="flex-1"
              style={{ minWidth: fitToWidth ? 0 : colWidth }}
            >
              <div className="mb-1 rounded-md bg-[var(--surface-2)] py-1 text-center text-xs font-semibold capitalize text-[var(--text)]">
                {format(monthStart, "MMMM yyyy", { locale: de })}
              </div>
              <div>
                {days.map((day) => {
                  const key = formatLocalDate(day);
                  const holiday = holidayMap.get(key);
                  const inFerien = !holiday ? ferienForDate(key) : null;
                  const weekend = isWeekend(day);
                  const dayVacations = vacationsByDate.get(key) ?? [];
                  const selected = selRange && key >= selRange[0] && key <= selRange[1];
                  const bg = selected
                    ? "var(--accent-soft)"
                    : holiday
                      ? "var(--holiday-bg)"
                      : inFerien && weekend
                        ? "var(--ferien-weekend-bg)"
                        : inFerien
                          ? "var(--ferien-bg)"
                          : weekend
                            ? "var(--weekend-bg)"
                            : "transparent";
                  const label = holiday?.name ?? inFerien?.name;
                  const labelColor = holiday
                    ? "var(--holiday-text)"
                    : inFerien
                      ? "var(--ferien-text)"
                      : weekend
                        ? "var(--weekend-text)"
                        : "var(--text-muted)";

                  return (
                    <div
                      key={key}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        isDragging.current = true;
                        setDragAnchor(key);
                        setDragCurrent(key);
                      }}
                      onMouseEnter={() => {
                        if (isDragging.current) setDragCurrent(key);
                      }}
                      title={label ?? format(day, "EEEE d. MMMM yyyy", { locale: de })}
                      className="relative flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 hover:brightness-125"
                      style={{ height: rowH, background: bg }}
                    >
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
                        {day.getDate()}
                      </span>
                      <span className="w-5 shrink-0 text-[10px] uppercase" style={{ color: labelColor }}>
                        {format(day, "EE", { locale: de }).slice(0, 2)}
                      </span>
                      {showKw && (
                        <span
                          className="shrink-0 text-right text-[9px] tabular-nums text-[var(--text-faint)]"
                          style={{ width: kwWidth }}
                        >
                          {day.getDay() === 1 ? `KW ${getISOWeek(day)}` : ""}
                        </span>
                      )}
                      {showText && label && (
                        <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: labelColor }}>
                          {label}
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-0.5">
                        {dayVacations.slice(0, maxBadges).map((v) => {
                          const person = v.person ?? personById.get(v.personId);
                          if (!person) return null;
                          const isHalf = isHalfDay(v, person, day);
                          return (
                            <span
                              key={v.id}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onVacationClick(v);
                              }}
                              title={`${person.name}${isHalf ? " (halber Tag)" : ""}${v.note ? " · " + v.note : ""}`}
                              className="rounded px-1 text-[9px] font-semibold leading-[15px] text-[#04121b] cursor-pointer hover:brightness-110"
                              style={{ background: person.color }}
                            >
                              {personInitials(person.name)}
                              {isHalf ? "½" : ""}
                            </span>
                          );
                        })}
                        {dayVacations.length > maxBadges && (
                          <span
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowKey((prev) => (prev === key ? null : key));
                            }}
                            title={dayVacations
                              .slice(maxBadges)
                              .map((v) => (v.person ?? personById.get(v.personId))?.name)
                              .filter(Boolean)
                              .join(", ")}
                            className="rounded px-1 text-[9px] font-semibold leading-[15px] text-[var(--text)] underline decoration-dotted cursor-pointer hover:text-[var(--accent)]"
                          >
                            +{dayVacations.length - maxBadges}
                          </span>
                        )}
                      </span>

                      {overflowKey === key && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowKey(null);
                            }}
                          />
                          <div
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
                          >
                            {dayVacations.map((v) => {
                              const person = v.person ?? personById.get(v.personId);
                              if (!person) return null;
                              const isHalf = isHalfDay(v, person, day);
                              return (
                                <button
                                  key={v.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOverflowKey(null);
                                    onVacationClick(v);
                                  }}
                                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                >
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: person.color }}
                                  />
                                  <span className="flex-1 truncate">{person.name}</span>
                                  {isHalf && <span className="text-[var(--text-faint)]">½</span>}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {Array.from({ length: maxDays - days.length }).map((_, i) => (
                  <div key={`pad-${i}`} style={{ height: rowH }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

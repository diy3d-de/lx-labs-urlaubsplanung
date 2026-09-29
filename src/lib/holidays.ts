export interface PublicHoliday {
  date: string;
  name: string;
  isRegional: boolean;
}

export interface SchoolHolidayPeriod {
  name: string;
  start: string;
  end: string;
}

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  counties: string[] | null;
  global: boolean;
}

interface OpenHolidaysEntry {
  startDate: string;
  endDate: string;
  name: { language: string; text: string }[];
}

const holidayCache = new Map<string, { data: PublicHoliday[]; expires: number }>();
const ferienCache = new Map<string, { data: SchoolHolidayPeriod[]; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12h

export async function fetchPublicHolidays(
  year: number,
  bundeslandCode: string
): Promise<PublicHoliday[]> {
  const cacheKey = `${year}-${bundeslandCode}`;
  const cached = holidayCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`, {
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) throw new Error(`Feiertags-API Fehler: ${res.status}`);
  const raw: NagerHoliday[] = await res.json();

  const county = `DE-${bundeslandCode}`;
  const data: PublicHoliday[] = raw
    .filter((h) => h.global || h.counties?.includes(county))
    .map((h) => ({
      date: h.date,
      name: h.localName,
      isRegional: !h.global,
    }));

  holidayCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
  return data;
}

export async function fetchSchoolHolidays(
  year: number,
  bundeslandCode: string
): Promise<SchoolHolidayPeriod[]> {
  const cacheKey = `${year}-${bundeslandCode}`;
  const cached = ferienCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const params = new URLSearchParams({
    countryIsoCode: "DE",
    languageIsoCode: "DE",
    validFrom: `${year}-01-01`,
    validTo: `${year}-12-31`,
    subdivisionCode: `DE-${bundeslandCode}`,
  });
  const res = await fetch(`https://openholidaysapi.org/SchoolHolidays?${params}`, {
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) throw new Error(`Ferien-API Fehler: ${res.status}`);
  const raw: OpenHolidaysEntry[] = await res.json();

  const data: SchoolHolidayPeriod[] = raw.map((f) => ({
    name: f.name.find((n) => n.language === "DE")?.text ?? f.name[0]?.text ?? "Ferien",
    start: f.startDate,
    end: f.endDate,
  }));

  ferienCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
  return data;
}

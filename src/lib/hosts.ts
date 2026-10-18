/**
 * Schutz gegen DNS-Rebinding: Eine fremde Webseite kann ihren Domainnamen auf die IP dieses Servers (oder
 * 127.0.0.1 der Desktop-App) umbiegen und gilt dann im Browser als „gleiche Herkunft“. Der Host-Header trägt
 * dabei aber weiterhin ihren Domainnamen - deshalb nur bekannte Hosts zulassen.
 *
 * Standardmäßig erlaubt: IP-Adressen, localhost, Namen ohne Punkt (z. B. „nas“) und lokale Zonen
 * (.local, .lan, .home, .home.arpa, .internal, .fritz.box). Weitere Namen (z. B. hinter einem Reverse-Proxy)
 * über ALLOWED_HOSTS, kommagetrennt, ohne Port.
 */

const LOKALE_ZONEN = [".local", ".lan", ".home", ".home.arpa", ".internal", ".fritz.box", ".localhost"];

/** Hostname ohne Port, kleingeschrieben; IPv6 ohne Klammern. null bei ungültigem Header. */
export function hostname(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  const v6 = /^\[([0-9a-f:.]+)\](?::\d+)?$/.exec(h);
  if (v6) return v6[1];
  const m = /^([a-z0-9.-]+)(?::\d+)?$/.exec(h);
  return m ? m[1].replace(/\.$/, "") : null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isAllowedHost(hostHeader: string | null, allowedEnv: string | undefined): boolean {
  const name = hostname(hostHeader);
  if (!name) return false;
  const extra = (allowedEnv ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(name)) return true;
  if (IPV4.test(name) || name.includes(":")) return true;
  if (name === "localhost" || !name.includes(".")) return true;
  return LOKALE_ZONEN.some((zone) => name.endsWith(zone));
}

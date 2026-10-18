// Update-Fehler einordnen: "kein Internet" ist oft ein Normalzustand und kein Grund zur Sorge;
// eine Ablehnung durch GitHub (z. B. noch keine veröffentlichte Version, API-Limit) dagegen schon.

/** @typedef {"offline" | "zugang" | "sonstige"} UpdateFehlerArt */

const OFFLINE =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|getaddrinfo|socket hang up|network (is )?unreachable/i;
const ZUGANG =
  /\b(401|403|404|429)\b|unauthorized|forbidden|bad credentials|not found|rate limit|no published versions|cannot find latest\.yml/i;

/** @returns {UpdateFehlerArt} */
function klassifiziereUpdateFehler(meldung) {
  if (OFFLINE.test(meldung)) return "offline";
  if (ZUGANG.test(meldung)) return "zugang";
  return "sonstige";
}

/** Verständlicher Text je Art; bei "sonstige" die ursprüngliche (gekürzte) Meldung. */
function updateFehlerText(art, meldung) {
  switch (art) {
    case "offline":
      return "Keine Verbindung zum Update-Server (Internet?). Die Prüfung wird automatisch wiederholt.";
    case "zugang":
      return "GitHub hat die Anfrage abgelehnt oder keine veröffentlichte Version gefunden (evtl. Abruflimit erreicht). Die Prüfung wird später wiederholt.";
    default:
      return meldung;
  }
}

module.exports = { klassifiziereUpdateFehler, updateFehlerText };

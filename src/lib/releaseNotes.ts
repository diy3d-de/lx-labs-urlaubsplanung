// Gliedert Release-Notes für das Update-Fenster der Desktop-App in Abschnitte („Neu“, „Geändert“,
// „Hinweis“ …) mit Aufzählungspunkten. Format siehe docs/release-notes-vorlage.md.

export type NotesAbschnitt = { titel: string | null; zeilen: Array<{ art: "punkt" | "text"; text: string }> };

/**
 * Zeilen mit „- “/„* “/„• “ sind Punkte, kurze Zeilen ohne Satzzeichen am Ende (oder Markdown-Überschriften)
 * beginnen einen Abschnitt. Eine Titelzeile, die mit der Versionsnummer endet („Produkt 1.2.3“), entfällt.
 */
export function gliedereNotes(text: string, version?: string): NotesAbschnitt[] {
  const abschnitte: NotesAbschnitt[] = [];
  let aktuell: NotesAbschnitt | null = null;
  const neu = (titel: string | null): NotesAbschnitt => {
    aktuell = { titel, zeilen: [] };
    abschnitte.push(aktuell);
    return aktuell;
  };
  let erste = true;
  for (const roh of text.split("\n")) {
    const zeile = roh.trim();
    if (!zeile) continue;
    const istTitel =
      erste && (/\sv?\d+\.\d+\.\d+$/.test(zeile) || (version !== undefined && zeile.replace(/^v/, "") === version));
    erste = false;
    if (istTitel) continue;
    const punkt = /^[-*•]\s+(.*)$/.exec(zeile);
    if (punkt) {
      (aktuell ?? neu(null)).zeilen.push({ art: "punkt", text: punkt[1] });
      continue;
    }
    const ueberschrift = /^#{1,6}\s+(.*)$/.exec(zeile);
    if (ueberschrift || (zeile.length <= 40 && !/[.:!?,;)]$/.test(zeile))) {
      neu((ueberschrift ? ueberschrift[1] : zeile).replace(/\*\*/g, ""));
      continue;
    }
    const ziel: NotesAbschnitt = aktuell ?? neu(null);
    const letzte = ziel.zeilen[ziel.zeilen.length - 1];
    // Fortsetzungszeile eines Punkts (eingerückt umbrochen)
    if (letzte && letzte.art === "punkt" && /^\s{2,}/.test(roh)) letzte.text += ` ${zeile}`;
    else ziel.zeilen.push({ art: "text", text: zeile });
  }
  // Eine "Überschrift" ohne Inhalt war ein kurzer Satz ohne Punkt - als Text zeigen.
  return abschnitte.map((a) =>
    a.zeilen.length === 0 && a.titel ? { titel: null, zeilen: [{ art: "text" as const, text: a.titel }] } : a
  );
}

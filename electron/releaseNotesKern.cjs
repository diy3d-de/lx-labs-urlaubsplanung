// Release-Notes für das Update-Fenster in schlichten Text wandeln. electron-updater liefert sie beim
// öffentlichen GitHub-Repo aus dem Release-Feed als HTML. Gegliedert wird im Renderer
// (src/lib/releaseNotes.ts); dargestellt wird immer als Text, nie als HTML.

const MAX_NOTES_ZEICHEN = 20_000;

/** HTML in schlichten Text; leere Notes ergeben null. */
function notesAlsText(roh) {
  if (!roh) return null;
  const text = String(roh)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_NOTES_ZEICHEN);
  return text.length > 0 ? text : null;
}

module.exports = { MAX_NOTES_ZEICHEN, notesAlsText };

// Projektbezogene Werte für die automatischen Updates.
// Abweichend von der Vorlage: Quellcode und Releases liegen im selben öffentlichen Repo (MIT) -
// deshalb kein privates Release-Repo, kein Lese-Token in der App und kein Publish-Token in der CI
// (dort reicht der eingebaute GITHUB_TOKEN).

/** GitHub-Konto des Release-Repos. */
const RELEASE_OWNER = "diy3d-de";

/** Öffentliches Repo mit den Releases. */
const RELEASE_REPO = "lx-labs-urlaubsplanung";

/**
 * Prozessname des NSIS-Installers ohne Version - muss zu build.nsis.artifactName in package.json passen
 * ("lx-urlaubsplanung-Setup-${version}.${ext}" → "lx-urlaubsplanung-Setup"). Ohne Leerzeichen.
 */
const SETUP_PROZESS_PRAEFIX = "lx-urlaubsplanung-Setup";

/** Umgebungsvariable, über die der Neustart-Wächter den Programmpfad bekommt. */
const NEUSTART_EXE_VARIABLE = "LX_URLAUBSPLANUNG_NEUSTART_EXE";

/** Erste Prüfung nach dem Start und Abstand der weiteren Prüfungen. */
const ERSTE_PRUEFUNG_NACH_MS = 15_000;
const PRUEF_INTERVALL_MS = 6 * 60 * 60 * 1000;

module.exports = {
  RELEASE_OWNER,
  RELEASE_REPO,
  SETUP_PROZESS_PRAEFIX,
  NEUSTART_EXE_VARIABLE,
  ERSTE_PRUEFUNG_NACH_MS,
  PRUEF_INTERVALL_MS,
};

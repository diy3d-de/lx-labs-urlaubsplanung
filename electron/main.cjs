// Electron-Hauptprozess: startet den Next.js-Standalone-Server lokal und zeigt ihn in einem Fenster.
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { getUpdateStatus, initUpdater, installiereUpdate, suchenNachUpdates } = require("./updater.cjs");

const ICON = path.join(__dirname, "icon.png");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Wendet die Prisma-Migrationen (SQL-Dateien) direkt per better-sqlite3 an, ohne Prisma-CLI.
function migrate(dbPath, migrationsDir, serverDir) {
  // better-sqlite3 aus dem Standalone-Paket (für Electron neu gebaut)
  const Database = require(require.resolve("better-sqlite3", { paths: [serverDir] }));
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS _app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const done = new Set(db.prepare("SELECT name FROM _app_migrations").all().map((r) => r.name));
    const names = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO _app_migrations (name, applied_at) VALUES (?, ?)").run(name, new Date().toISOString());
      })();
    }
  } finally {
    db.close();
  }
}

async function startServer() {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "build");
  const serverDir = path.join(base, "standalone");
  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "urlaubsplanung.db");

  migrate(dbPath, path.join(base, "migrations"), serverDir);

  const port = await findFreePort();
  process.env.SQLITE_PATH = dbPath;
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.chdir(serverDir);
  require(path.join(serverDir, "server.js"));

  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return url;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("Der lokale Server ist nicht gestartet.");
}

let mainWindow = null;
let appOrigin = null;

function sameOrigin(target) {
  try {
    return new URL(target).origin === appOrigin;
  } catch {
    return false;
  }
}

/** Update-Kanäle nur für das eigene Hauptfenster mit der eigenen Seite. */
function vomHauptfenster(event) {
  return mainWindow !== null && event.sender === mainWindow.webContents && sameOrigin(event.senderFrame?.url ?? "");
}

function registriereUpdateKanaele() {
  ipcMain.handle("update:get-status", (event) => (vomHauptfenster(event) ? getUpdateStatus() : null));
  ipcMain.handle("update:check", (event) => (vomHauptfenster(event) ? suchenNachUpdates() : undefined));
  ipcMain.handle("update:install", (event) =>
    vomHauptfenster(event) ? installiereUpdate() : { ok: false, grund: "Nicht erlaubt" },
  );
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: ICON,
    title: "lx-urlaubsplanung",
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
  win.once("ready-to-show", () => win.show());

  const url = await startServer();
  appOrigin = new URL(url).origin;
  // Externe Links im Standardbrowser öffnen, nie im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  const nurEigeneSeite = (e, target) => {
    if (!sameOrigin(target)) {
      e.preventDefault();
      if (/^https?:/i.test(target)) shell.openExternal(target);
    }
  };
  win.webContents.on("will-navigate", nurEigeneSeite);
  win.webContents.on("will-redirect", nurEigeneSeite);
  win.webContents.on("will-frame-navigate", (e) => {
    if (!sameOrigin(e.url)) e.preventDefault();
  });
  await win.loadURL(url);
}

// Ein zweiter Start (z. B. durch den Neustart-Wächter nach einem Update) beendet sich sofort
// und holt das vorhandene Fenster nach vorn.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    // Die App braucht keine Browser-Berechtigungen (Kamera, Mikrofon, Standort, Benachrichtigungen …)
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registriereUpdateKanaele();
    try {
      await createWindow();
    } catch (err) {
      dialog.showErrorBox("lx-urlaubsplanung konnte nicht starten", String(err?.stack ?? err));
      app.quit();
      return;
    }
    initUpdater({
      onStatus: (status) => mainWindow?.webContents.send("update:status", status),
      log: (zeile) => console.log(zeile),
      // Kein Vorgang im Hauptprozess, den ein Beenden beschädigen würde: Schreibzugriffe sind kurze
      // SQLite-Transaktionen. Offene Dialoge und laufende Importe sperrt die Oberfläche (sperrGrund).
      installationGesperrt: () => null,
      vorInstallation: async () => {},
    });
  });
  app.on("window-all-closed", () => app.quit());
}

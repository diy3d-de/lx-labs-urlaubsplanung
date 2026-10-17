// electron-builder filtert node_modules aus extraResources heraus; der Standalone-Server braucht sie aber.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, "build", "standalone", "node_modules");
  const dest = path.join(context.appOutDir, "resources", "standalone", "node_modules");
  fs.cpSync(src, dest, { recursive: true });
};

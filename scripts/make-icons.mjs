// Erzeugt electron/icon.png (512px), electron/icon.ico und src/app/favicon.ico aus electron/icon.svg.
import fs from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const svg = fs.readFileSync("electron/icon.svg");
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()));
fs.writeFileSync("electron/icon.png", await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer());
const ico = await pngToIco(pngs);
fs.writeFileSync("electron/icon.ico", ico);
fs.writeFileSync("src/app/favicon.ico", ico);
console.log("Icons erzeugt");

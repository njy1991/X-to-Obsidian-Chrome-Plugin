// Bundles the extension into dist/save-to-obsidian-<version>.zip for sideloading
// via chrome://extensions → "Load unpacked" (unzip first) or for distribution.
// Uses the system `zip` command so we stay dependency-free.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = resolve(ROOT, "dist");
const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
const zipName = `save-to-obsidian-${manifest.version}.zip`;
const zipPath = resolve(DIST, zipName);

const REQUIRED = ["manifest.json", "src"];
for (const f of REQUIRED) {
  if (!existsSync(resolve(ROOT, f))) {
    console.error(`Missing required path: ${f}`);
    process.exit(1);
  }
}

const iconDir = resolve(ROOT, "src/icons");
if (!existsSync(iconDir) || statSync(iconDir).isDirectory() === false) {
  console.error("src/icons/ missing. Run `npm run icons` first.");
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// -x excludes; keep dotfiles and build artifacts out of the package.
execFileSync(
  "zip",
  [
    "-r",
    "-q",
    zipPath,
    "manifest.json",
    "src",
    "LICENSE",
    "README.md",
    "-x",
    "*.DS_Store",
    "src/**/*.map",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const sizeKb = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`Built ${zipPath} (${sizeKb} KB)`);

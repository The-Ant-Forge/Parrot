/**
 * Bumps the commit number (A) in version 1.A.B and resets B to 0.
 * Run manually via "npm run version:commit".
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "package.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, a] = pkg.version.split(".").map(Number);
pkg.version = `${major}.${a + 1}.0`;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Version bumped to ${pkg.version}`);

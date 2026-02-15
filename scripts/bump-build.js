/**
 * Bumps the build number (B) in version 1.A.B
 * Run automatically before each build via the "prebuild" npm script.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "package.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, a, b] = pkg.version.split(".").map(Number);
pkg.version = `${major}.${a}.${b + 1}`;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Version bumped to ${pkg.version}`);

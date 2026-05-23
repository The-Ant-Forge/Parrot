/**
 * Syncs docs/wiki/ from this repo into the sibling GitHub wiki clone
 * (Parrot.wiki/), commits, and pushes.
 *
 * Usage:
 *   npm run wiki:sync                     # default commit message
 *   npm run wiki:sync -- "your message"   # custom commit message
 *
 * One-time setup: clone the wiki repo next to the main repo.
 *   cd ..
 *   git clone https://github.com/The-Ant-Forge/Parrot.wiki.git
 *   cd Parrot
 *
 * If the wiki repo doesn't exist yet on GitHub, you must first create
 * a page via the web UI (https://github.com/.../wiki) to bootstrap it
 * — GitHub doesn't provision the .wiki.git repo until then.
 */

import { readFileSync, readdirSync, copyFileSync, existsSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const wikiSource = resolve(repoRoot, "docs", "wiki");
const wikiTarget = resolve(repoRoot, "..", "Parrot.wiki");
const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf-8"));

const customMessage = process.argv.slice(2).join(" ").trim();
const commitMessage = customMessage || `Sync wiki content (Parrot v${pkg.version})`;

function fail(msg) {
  console.error(`\n[wiki:sync] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(wikiTarget) || !statSync(wikiTarget).isDirectory()) {
  fail(
    `Wiki clone not found at ${wikiTarget}\n\n` +
      `Clone it first:\n` +
      `  cd ${dirname(wikiTarget)}\n` +
      `  git clone https://github.com/The-Ant-Forge/Parrot.wiki.git\n\n` +
      `If the clone command fails with "Repository not found", create the first\n` +
      `wiki page via the GitHub web UI to bootstrap the repo, then retry.`,
  );
}

// Copy every .md file from docs/wiki/ except README.md (which documents
// this very sync flow and isn't intended as a wiki page).
const sourceFiles = readdirSync(wikiSource)
  .filter((f) => f.endsWith(".md") && f !== "README.md");

if (sourceFiles.length === 0) {
  fail("No source files found in docs/wiki/");
}

console.log(`[wiki:sync] Copying ${sourceFiles.length} files to ${wikiTarget}`);
for (const file of sourceFiles) {
  copyFileSync(join(wikiSource, file), join(wikiTarget, file));
  console.log(`  + ${file}`);
}

// Check for changes in the wiki working tree
const status = execSync("git status --porcelain", {
  cwd: wikiTarget,
  encoding: "utf-8",
});

if (!status.trim()) {
  console.log(`\n[wiki:sync] Wiki is already up to date — nothing to commit.`);
  process.exit(0);
}

console.log(`\n[wiki:sync] Changes detected:\n${status}`);

try {
  execSync("git add .", { cwd: wikiTarget, stdio: "inherit" });
  execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
    cwd: wikiTarget,
    stdio: "inherit",
  });
  execSync("git push", { cwd: wikiTarget, stdio: "inherit" });
} catch {
  fail("git command failed — see output above");
}

console.log(`\n[wiki:sync] Wiki updated: https://github.com/The-Ant-Forge/Parrot/wiki`);

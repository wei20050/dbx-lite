#!/usr/bin/env node
/**
 * Formats staged frontend files with oxfmt.
 *
 * oxfmt 0.76 uses the `v` regular-expression flag, which Node 18 cannot parse,
 * so running it through whatever `node` happens to be first on PATH breaks
 * commits on machines whose default Node is older than 20. This wrapper:
 *
 *   1. reuses the current Node when it is >= 20,
 *   2. otherwise looks for a newer Node in the usual install locations,
 *   3. and if none is found, warns and skips formatting instead of failing the
 *      commit (`pnpm fmt` still formats everything on demand).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MINIMUM_MAJOR = 20;
const files = process.argv.slice(2).filter(Boolean);

if (files.length === 0) {
  process.exit(0);
}

function nodeMajor(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return 0;
  const major = Number(result.stdout.trim().replace(/^v/, "").split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function existingDirectories(candidate) {
  if (!candidate) return [];
  try {
    return readdirSync(candidate, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(candidate, entry.name));
  } catch {
    return [];
  }
}

function nodeCandidates() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = [process.execPath];

  const push = (candidate) => {
    if (candidate && existsSync(candidate)) candidates.push(candidate);
  };

  push(path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"));
  push(path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"));
  push(path.join(home, "AppData", "Local", "Programs", "nodejs", "node.exe"));
  push(path.join(process.env.NVM_HOME || "", "node.exe"));
  push("/usr/local/bin/node");
  push("/opt/homebrew/bin/node");

  // Version-manager layouts: <root>/<version>/node.exe and
  // <root>/<version>/installation/node.exe (fnm / Volta style).
  const versionRoots = [
    path.join(home, ".workbuddy", "binaries", "node", "versions"),
    path.join(process.env.APPDATA || "", "fnm", "node-versions"),
    path.join(home, ".local", "share", "fnm", "node-versions"),
    path.join(home, "scoop", "apps", "nodejs"),
    path.join(home, ".nvm", "versions", "node"),
  ];
  for (const root of versionRoots) {
    for (const directory of existingDirectories(root)) {
      push(path.join(directory, "node.exe"));
      push(path.join(directory, "installation", "node.exe"));
      push(path.join(directory, "current", "node.exe"));
    }
  }

  return [...new Set(candidates)];
}

const usableNode = nodeCandidates().find((binary) => nodeMajor(binary) >= MINIMUM_MAJOR);
if (!usableNode) {
  console.warn(
    `[format] skipped oxfmt: it needs Node >= ${MINIMUM_MAJOR}, current is ${process.version}. ` +
      "Install a newer Node or run `pnpm fmt` manually.",
  );
  process.exit(0);
}

const oxfmt = path.join(process.cwd(), "node_modules", "oxfmt", "bin", "oxfmt");
if (!existsSync(oxfmt)) {
  console.warn(`[format] skipped oxfmt: ${oxfmt} not found (run the package manager install first).`);
  process.exit(0);
}

const result = spawnSync(usableNode, [oxfmt, ...files], { stdio: "inherit" });
if (result.error) {
  console.warn(`[format] oxfmt could not start (${result.error.message}); commit continues.`);
  process.exit(0);
}
process.exit(result.status ?? 0);

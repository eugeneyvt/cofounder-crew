import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { initProject } from "../src/init.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("node_modules/.bin/tsx");
const cliArgs = [path.resolve("src/cli.ts")];

test("CLI help is namespaced and omits removed top-level task aliases", async () => {
  const { stdout } = await execFileAsync(cli, [...cliArgs, "help"], { cwd: process.cwd() });

  assert.match(stdout, /cofounder start/);
  assert.match(stdout, /cofounder add\s+Interactive shortcut/);
  assert.match(stdout, /cofounder pin\s+Pin Cofounder as a project-local dev dependency/);
  assert.match(stdout, /cofounder task delegate\s+Start an async member task/);
  assert.match(stdout, /cofounder mcp add/);
  assert.doesNotMatch(stdout, /cofounder delegate <member>/);
  assert.doesNotMatch(stdout, /cofounder status <task_id>/);
  assert.doesNotMatch(stdout, /cofounder logs <task_id>/);
});

test("CLI can add members, MCP servers, and scoped skills", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-cli-"));
  try {
    await initProject(dir);
    await execFileAsync(cli, [
      ...cliArgs,
      "member",
      "add",
      "designer",
      "--title",
      "Product Designer",
      "--model",
      "gpt-5.5",
      "--write-mode",
      "worktree",
      "--responsibility",
      "inspect design files"
    ], { cwd: dir });
    await execFileAsync(cli, [
      ...cliArgs,
      "mcp",
      "add",
      "pencil",
      "--url",
      "https://example.com/mcp",
      "--assign",
      "designer"
    ], { cwd: dir });
    await execFileAsync(cli, [
      ...cliArgs,
      "skill",
      "add",
      "design-review",
      "--scope",
      "team",
      "--description",
      "Review design files.",
      "--assign",
      "designer"
    ], { cwd: dir });

    const team = await readFile(path.join(dir, ".cofounder/team.yaml"), "utf8");
    const settings = await readFile(path.join(dir, ".cofounder/members/designer/settings.toml"), "utf8");
    const mcp = await readFile(path.join(dir, ".cofounder/mcp/pencil.toml"), "utf8");
    const skill = await readFile(path.join(dir, ".cofounder/skills/design-review/SKILL.md"), "utf8");

    assert.match(team, /designer:/);
    assert.match(settings, /mode = "worktree"/);
    assert.match(settings, /team = \[ "pencil" \]/);
    assert.match(settings, /team = \[ "design-review" \]/);
    assert.match(mcp, /url = "https:\/\/example\.com\/mcp"/);
    assert.match(skill, /description: Review design files\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cofounder update repairs Codex MCP without changing project dependencies", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-update-"));
  try {
    await initProject(dir);
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: {} }, null, 2),
      "utf8"
    );

    const fake = await makeFakeToolchain(dir);
    const { stdout } = await execFileAsync(cli, [...cliArgs, "update", "--yes"], {
      cwd: dir,
      env: fake.env
    });

    const npmLog = await readFile(fake.npmLog, "utf8");
    const codexLog = await readFile(fake.codexLog, "utf8");

    assert.match(stdout, /Update Cofounder/);
    assert.doesNotMatch(npmLog, /npm install/);
    assert.match(codexLog, /codex mcp remove cofounder/);
    assert.match(codexLog, /codex mcp add cofounder -- npx -y --package cofounder-crew -- cofounder serve mcp/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cofounder pin adds or updates the project-local package pin", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-pin-"));
  try {
    await initProject(dir);
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ devDependencies: {} }, null, 2), "utf8");

    const fake = await makeFakeToolchain(dir);
    await execFileAsync(cli, [...cliArgs, "pin", "--yes"], {
      cwd: dir,
      env: fake.env
    });

    const npmLog = await readFile(fake.npmLog, "utf8");
    assert.match(npmLog, /npm install --save-dev cofounder-crew@latest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cofounder self update updates the global CLI installation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-self-update-"));
  try {
    const fake = await makeFakeToolchain(dir);
    await execFileAsync(cli, [...cliArgs, "self", "update"], {
      cwd: dir,
      env: fake.env
    });

    const npmLog = await readFile(fake.npmLog, "utf8");
    assert.equal((npmLog.match(/npm install -g cofounder-crew@latest/g) ?? []).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeFakeToolchain(dir: string): Promise<{ env: NodeJS.ProcessEnv; npmLog: string; codexLog: string }> {
  const binDir = path.join(dir, "bin");
  const npmLog = path.join(dir, "npm.log");
  const codexLog = path.join(dir, "codex.log");
  await mkdir(binDir, { recursive: true });
  await writeFile(path.join(binDir, "npm"), `#!/usr/bin/env sh
printf 'npm %s\\n' "$*" >> "$FAKE_NPM_LOG"
if [ "$1" = "--version" ]; then
  echo "10.0.0"
fi
exit 0
`, "utf8");
  await writeFile(path.join(binDir, "codex"), `#!/usr/bin/env sh
printf 'codex %s\\n' "$*" >> "$FAKE_CODEX_LOG"
if [ "$1" = "--version" ]; then
  echo "codex 0.0.0-test"
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "get" ]; then
  echo "command: npx -y --package cofounder-crew -- cofounder serve mcp"
  exit 0
fi
exit 0
`, "utf8");
  await chmod(path.join(binDir, "npm"), 0o755);
  await chmod(path.join(binDir, "codex"), 0o755);
  return {
    npmLog,
    codexLog,
    env: {
      ...process.env,
      FAKE_NPM_LOG: npmLog,
      FAKE_CODEX_LOG: codexLog,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`
    }
  };
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

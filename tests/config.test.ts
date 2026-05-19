import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findRecentCodexSessionId } from "../src/codexSessions.js";
import { getMember, loadMemberSettings, loadProject } from "../src/config.js";
import { initProject, syncProjectInstructions } from "../src/init.js";
import { deriveProjectInstructionsFromAgents } from "../src/projectContext.js";
import { formatCodexSetup } from "../src/setup.js";
import { listProjectTemplates } from "../src/templates.js";

test("init creates a loadable Codex team", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-config-"));
  try {
    await initProject(dir);
    const project = await loadProject(dir);
    assert.equal(project.projectRoot, dir);
    assert.equal(project.team.version, 1);
    assert.deepEqual(project.team.project_context, { mode: "auto", file: "project.md" });
    assert.deepEqual(Object.keys(project.team.members), ["lead", "backend", "reviewer"]);
    assert.equal(getMember(project, "backend").runner, "codex");

    const settings = await loadMemberSettings(project, getMember(project, "backend"));
    assert.equal(settings.model, "gpt-5.5");
    assert.equal(settings.write?.mode, "direct");
    assert.equal(settings.mcp?.mode, "inherit");
    assert.equal(settings.runner?.codex?.json, true);

    const reviewerSettings = await loadMemberSettings(project, getMember(project, "reviewer"));
    assert.equal(reviewerSettings.mcp?.mode, "none");

    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    const codexInstructions = await readFile(path.join(dir, ".cofounder/codex-instructions.md"), "utf8");
    const cofounderGitignore = await readFile(path.join(dir, ".cofounder/.gitignore"), "utf8");
    const projectInstructions = await readFile(path.join(dir, ".cofounder/project.md"), "utf8");
    assert.match(agents, /conversation-first local AI teamwork/);
    assert.match(agents, /You are the Cofounder\/orchestrator/);
    assert.match(agents, /Proactively use the Cofounder team/);
    assert.match(agents, /Do not perform specialist work yourself/);
    assert.equal(codexInstructions, agents);
    assert.match(cofounderGitignore, /^runs\/$/m);
    assert.match(cofounderGitignore, /^worktrees\/$/m);
    assert.match(projectInstructions, /Shared Project Instructions/);
    assert.match(projectInstructions, /cofounder sync project/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init supports the worktree template", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-template-"));
  try {
    const result = await initProject(dir, { template: "worktree" });
    assert.equal(result.template, "worktree");

    const project = await loadProject(dir);
    assert.equal(project.team.team?.id, "worktree");

    const backendSettings = await loadMemberSettings(project, getMember(project, "backend"));
    const reviewerSettings = await loadMemberSettings(project, getMember(project, "reviewer"));
    assert.equal(backendSettings.write?.mode, "worktree");
    assert.equal(reviewerSettings.write?.mode, "direct");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init preserves existing AGENTS.md and returns required bridge notice", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-existing-agents-"));
  try {
    await writeFile(path.join(dir, "AGENTS.md"), `# Existing Instructions

Run npm test before reporting done.

## Cofounder Crew

This project uses Cofounder Crew. You are the Cofounder/orchestrator.

## Code Style

Keep changes small.
`, "utf8");
    const result = await initProject(dir);

    assert.ok(result.skipped.includes("AGENTS.md"));
    assert.match(await readFile(path.join(dir, "AGENTS.md"), "utf8"), /Run npm test/);
    assert.match(await readFile(path.join(dir, ".cofounder/codex-instructions.md"), "utf8"), /conversation-first local AI teamwork/);
    const projectContext = await readFile(path.join(dir, ".cofounder/project.md"), "utf8");
    assert.match(projectContext, /Derived from AGENTS\.md/);
    assert.match(projectContext, /Run npm test before reporting done/);
    assert.match(projectContext, /Keep changes small/);
    assert.doesNotMatch(projectContext, /Cofounder\/orchestrator/);
    assert.equal(result.notices.length, 1);
    assert.match(result.notices[0], /add this block to AGENTS\.md/);
    assert.match(result.notices[0], /Read \.cofounder\/codex-instructions\.md/);
    assert.match(result.notices[0], /Cofounder\/orchestrator/);
    assert.match(result.notices[0], /proactively delegate substantive work/);
    assert.match(result.notices[0], /Do not perform specialist work yourself/);
    assert.match(result.notices[0], /\.cofounder\/project\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("project instruction derivation supports Codex project-doc scope and sync", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-project-doc-"));
  try {
    const derived = deriveProjectInstructionsFromAgents(`# Global

Ignore this global section.

--- project-doc ---

# Product Rules

Use pnpm.

## Cofounder Crew

You are the Cofounder/orchestrator.
`);
    assert.match(derived ?? "", /Product Rules/);
    assert.match(derived ?? "", /Use pnpm/);
    assert.doesNotMatch(derived ?? "", /Ignore this global section/);
    assert.doesNotMatch(derived ?? "", /Cofounder\/orchestrator/);

    await initProject(dir);
    await writeFile(path.join(dir, "AGENTS.md"), "# Project Rules\n\nPrefer Vitest.\n", "utf8");
    const result = await syncProjectInstructions(dir);
    assert.equal(result.path, ".cofounder/project.md");
    assert.equal(result.source, "AGENTS.md");
    assert.equal(result.derived, true);
    assert.match(await readFile(path.join(dir, ".cofounder/project.md"), "utf8"), /Prefer Vitest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("templates and Codex setup helpers are inspectable", async () => {
  assert.deepEqual(listProjectTemplates().map((template) => template.name), ["default", "worktree"]);
  await assert.rejects(() => initProject(process.cwd(), { template: "missing" }), /Unknown template/);
  const setup = formatCodexSetup();
  assert.match(setup, /npx -y --package cofounder-crew -- cofounder mcp/);
  assert.match(setup, /codex mcp add cofounder -- cofounder mcp/);
  assert.match(setup, /mcp\.js/);
});

test("Codex session discovery reads recent session metadata by cwd", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-session-cwd-"));
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "cofounder-codex-home-"));
  try {
    const now = new Date();
    const sessionDir = path.join(
      codexHome,
      "sessions",
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    );
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, "rollout-test.jsonl"), `${JSON.stringify({
      timestamp: now.toISOString(),
      type: "session_meta",
      payload: {
        id: "session-from-file",
        timestamp: now.toISOString(),
        cwd: dir
      }
    })}\n`, "utf8");

    assert.equal(await findRecentCodexSessionId({
      cwd: dir,
      since: now.toISOString(),
      codexHome
    }), "session-from-file");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

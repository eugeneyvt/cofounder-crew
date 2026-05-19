import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("create-cofounder prints registry-safe follow-up commands", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "create-cofounder-next-"));
  try {
    const fakeCofounder = path.join(dir, "fake-cofounder.js");
    await writeFile(fakeCofounder, "", "utf8");

    const { stdout } = await execFileAsync(
      process.execPath,
      [path.resolve("packages/create-cofounder/index.js"), "--template", "worktree", "--yes"],
      {
        cwd: dir,
        env: {
          ...process.env,
          COFOUNDER_CLI: fakeCofounder
        }
      }
    );

    assert.match(stdout, /worktree template needs a Git repository with at least one commit/);
    assert.match(stdout, /git commit -m "chore: initial commit"/);
    assert.match(stdout, /mode = "direct"/);
    assert.match(stdout, /npx -y --package cofounder-crew -- cofounder start --setup-codex --yes/);
    assert.match(stdout, /\n  codex\n/);
    assert.match(stdout, /Then ask Codex:/);
    assert.match(stdout, /Use the Cofounder team\. Show me who is available\./);
    assert.match(stdout, /Ask backend to inspect this repo and summarize the implementation boundaries\./);
    assert.match(stdout, /Help me add or adjust a Cofounder teammate for this project\./);
    assert.doesNotMatch(stdout, /npx -y --package cofounder-crew -- cofounder team/);
    assert.doesNotMatch(stdout, /npx -y --package cofounder-crew -- cofounder delegate/);
    assert.doesNotMatch(stdout, /\n  cofounder setup codex --install/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

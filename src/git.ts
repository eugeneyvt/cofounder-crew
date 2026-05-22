import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CofounderError } from "./errors.js";

const execFileAsync = promisify(execFile);
const WORKTREE_PREREQUISITE_ERROR = `worktree write mode requires a Git repository with at least one commit.
Worktrees are created from HEAD, so commit the baseline you want delegated agents to see.

For a scratch test:
  git init
  git add .
  git commit -m "chore: initial commit"

Or use direct mode by setting mode = "direct" under [write] in the member settings file.`;

export interface GitSnapshot {
  available: boolean;
  files: string[];
}

export interface GitPatch {
  patch: string;
  files: string[];
}

export async function readGitSnapshot(cwd: string): Promise<GitSnapshot> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z"], {
      cwd,
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      available: true,
      files: parsePorcelainFiles(stdout)
    };
  } catch {
    return {
      available: false,
      files: []
    };
  }
}

export async function createGitWorktree(projectRoot: string, worktreePath: string): Promise<void> {
  try {
    await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: projectRoot
    });
  } catch {
    throw new CofounderError(WORKTREE_PREREQUISITE_ERROR);
  }

  await mkdir(path.dirname(worktreePath), { recursive: true });

  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CofounderError(`failed to create git worktree: ${message}`);
  }
}

export async function removeGitWorktree(projectRoot: string, worktreePath: string): Promise<void> {
  try {
    await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CofounderError(`failed to remove git worktree: ${message}`);
  }
}

export async function createWorktreePatch(worktreePath: string): Promise<GitPatch> {
  try {
    await execFileAsync("git", ["add", "-N", "."], {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024
    });

    const [{ stdout: patch }, { stdout: fileOutput }] = await Promise.all([
      execFileAsync("git", ["diff", "--binary", "HEAD"], {
        cwd: worktreePath,
        maxBuffer: 50 * 1024 * 1024
      }),
      execFileAsync("git", ["diff", "--name-only", "-z", "HEAD"], {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024
      })
    ]);

    return {
      patch,
      files: parseNulList(fileOutput)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CofounderError(`failed to create worktree patch: ${message}`);
  } finally {
    try {
      await execFileAsync("git", ["reset", "-q"], {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024
      });
    } catch {
      // Best-effort cleanup for intent-to-add index entries.
    }
  }
}

export async function checkGitPatch(projectRoot: string, patch: string): Promise<void> {
  await runGitWithInput(projectRoot, ["apply", "--check"], patch, "git apply --check");
}

export async function applyGitPatch(projectRoot: string, patch: string): Promise<void> {
  await runGitWithInput(projectRoot, ["apply"], patch, "git apply");
}

export function diffChangedFiles(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((file) => !beforeSet.has(file)).sort();
}

export function mergeFiles(...groups: string[][]): string[] {
  return [...new Set(groups.flat())].sort();
}

function parsePorcelainFiles(output: string): string[] {
  const entries = output.split("\0").filter(Boolean);
  const files: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    const status = entry.slice(0, 2);
    const file = entry.slice(3);

    if (!file) {
      continue;
    }

    if (status.includes("R") || status.includes("C")) {
      const target = entries[index + 1];
      if (target) {
        files.push(target);
        index += 1;
        continue;
      }
    }

    files.push(file);
  }

  return [...new Set(files)]
    .filter((file) => !isCofounderRuntimeFile(file))
    .sort();
}

function parseNulList(output: string): string[] {
  return output.split("\0")
    .filter(Boolean)
    .filter((file) => !isCofounderRuntimeFile(file))
    .sort();
}

async function runGitWithInput(cwd: string, args: string[], input: string, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => reject(new CofounderError(`${label} failed: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const output = Buffer.concat(stderr).toString("utf8") || Buffer.concat(stdout).toString("utf8") || `exit code ${code ?? "unknown"}`;
      reject(new CofounderError(`${label} failed: ${output.trim()}`));
    });

    child.stdin.end(input);
  });
}

function isCofounderRuntimeFile(file: string): boolean {
  return file === ".cofounder" || file.startsWith(".cofounder/");
}

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

export async function findRecentCodexSessionId(options: {
  cwd: string;
  since: string | null;
  codexHome?: string;
}): Promise<string | null> {
  const sessionsRoot = path.join(options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "sessions");
  const candidates = await listCandidateSessionFiles(sessionsRoot, options.since);
  const sinceMs = options.since ? Date.parse(options.since) - 60_000 : 0;

  for (const filePath of candidates) {
    const meta = await readSessionMeta(filePath);
    if (!meta) {
      continue;
    }
    if (path.resolve(meta.cwd) !== path.resolve(options.cwd)) {
      continue;
    }
    if (sinceMs > 0 && meta.timestamp && Date.parse(meta.timestamp) < sinceMs) {
      continue;
    }
    return meta.id;
  }

  return null;
}

async function listCandidateSessionFiles(sessionsRoot: string, since: string | null): Promise<string[]> {
  const days = candidateDays(since ? new Date(since) : new Date());
  const files: Array<{ path: string; mtimeMs: number }> = [];

  for (const day of days) {
    const dir = path.join(sessionsRoot, day.year, day.month, day.day);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) {
        continue;
      }
      const filePath = path.join(dir, entry);
      try {
        const info = await stat(filePath);
        files.push({ path: filePath, mtimeMs: info.mtimeMs });
      } catch {
        // Ignore files that disappeared while scanning.
      }
    }
  }

  return files
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((file) => file.path);
}

async function readSessionMeta(filePath: string): Promise<{ id: string; cwd: string; timestamp?: string } | null> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of reader) {
      const raw = JSON.parse(line) as unknown;
      if (!isRecord(raw) || raw.type !== "session_meta" || !isRecord(raw.payload)) {
        return null;
      }
      const id = raw.payload.id;
      const cwd = raw.payload.cwd;
      const timestamp = raw.payload.timestamp;
      if (typeof id === "string" && typeof cwd === "string") {
        return {
          id,
          cwd,
          timestamp: typeof timestamp === "string" ? timestamp : undefined
        };
      }
      return null;
    }
  } catch {
    return null;
  } finally {
    reader.close();
    stream.destroy();
  }

  return null;
}

function candidateDays(date: Date): Array<{ year: string; month: string; day: string }> {
  return [-1, 0, 1].map((offset) => {
    const next = new Date(date);
    next.setDate(date.getDate() + offset);
    return {
      year: String(next.getFullYear()),
      month: String(next.getMonth() + 1).padStart(2, "0"),
      day: String(next.getDate()).padStart(2, "0")
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

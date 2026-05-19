import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { diffChangedFiles, mergeFiles, readGitSnapshot } from "./git.js";
import { appendTaskEvent, appendTaskLog, markTaskStatus, readTask, updateTask } from "./tasks.js";
import type { PreparedCodexConfig } from "./codexConfig.js";
import type { CodexCommand, MemberDefinition, MemberSettings, RunnerCapabilities, TaskEvent, TaskRecord } from "./types.js";

export const CODEX_CAPABILITIES: RunnerCapabilities = {
  runner: "codex",
  async_tasks: true,
  watch: true,
  cancel: true,
  live_interrupt: false,
  interrupt_mode: "cancel-resume",
  normalized_events: true,
  member_home: true
};

export function buildCodexCommand(
  task: TaskRecord,
  member: MemberDefinition,
  settings: MemberSettings,
  codexConfig?: PreparedCodexConfig
): CodexCommand {
  const executionCwd = getExecutionCwd(task);
  const isResume = Boolean(task.codex_resume_session_id);
  const args = isResume
    ? [
        "exec",
        "resume",
        "--skip-git-repo-check",
        "--output-last-message",
        path.resolve(task.cwd, task.result_path)
      ]
    : [
        "exec",
        "--cd",
        executionCwd,
        "--skip-git-repo-check",
        "--output-last-message",
        path.resolve(task.cwd, task.result_path)
      ];

  if (settings.model) {
    args.push("-m", settings.model);
  }
  if (!isResume && settings.sandbox) {
    args.push("-s", settings.sandbox);
  }
  if (!isResume && settings.approval) {
    args.push("-a", settings.approval);
  }
  if (settings.reasoning_effort) {
    args.push("-c", `model_reasoning_effort="${settings.reasoning_effort}"`);
  }
  if (settings.runner?.codex?.json) {
    args.push("--json");
  }
  if (codexConfig?.isolated) {
    args.push("--ignore-user-config");
    args.push(...codexConfig.override_args);
  }
  if (settings.runner?.codex?.extra_args?.length) {
    args.push(...settings.runner.codex.extra_args);
  }

  if (task.codex_resume_session_id) {
    args.push(task.codex_resume_session_id);
  }
  args.push("-");

  const env = { ...process.env };
  if (settings.runner?.codex?.use_member_home && member.home) {
    env.CODEX_HOME = path.resolve(task.config_root, member.home);
  }

  return {
    command: "codex",
    args,
    env,
    cwd: executionCwd
  };
}

export async function runCodexTask(
  task: TaskRecord,
  member: MemberDefinition,
  settings: MemberSettings,
  options: { streamToConsole?: boolean; codexConfig?: PreparedCodexConfig } = {}
): Promise<TaskRecord> {
  let current = await markTaskStatus(task.cwd, task, "running", "Codex runner started");
  const prompt = await readFile(path.resolve(task.cwd, task.prompt_path), "utf8");
  const command = buildCodexCommand(current, member, settings, options.codexConfig);
  const executionCwd = getExecutionCwd(current);
  const baseSnapshot = await readGitSnapshot(executionCwd);
  current = await updateTask(task.cwd, current.id, {
    git_available: baseSnapshot.available,
    base_changed_files: baseSnapshot.files
  });

  await appendTaskEvent(task.cwd, current, {
    time: new Date().toISOString(),
    task_id: current.id,
    type: "runner.command",
    message: [command.command, ...command.args.filter((arg) => arg !== prompt)].join(" ")
  });
  await appendTaskEvent(task.cwd, current, {
    time: new Date().toISOString(),
    task_id: current.id,
    type: "runner.environment",
    message: `cwd=${command.cwd} CODEX_HOME=${command.env.CODEX_HOME ?? "default"}`
  });
  await appendTaskEvent(task.cwd, current, {
    time: new Date().toISOString(),
    task_id: current.id,
    type: "git.snapshot",
    message: baseSnapshot.available
      ? `base changed files: ${baseSnapshot.files.length}`
      : "git unavailable"
  });

  return await new Promise<TaskRecord>((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const pendingWrites: Promise<void>[] = [];
    let stdoutBuffer = "";
    let stderrBuffer = "";

    void updateTask(task.cwd, current.id, { runner_pid: child.pid }).then((updated) => {
      current = updated;
    });

    child.stdin.end(prompt);

    child.stdout.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8");
      if (options.streamToConsole) {
        process.stdout.write(message);
      }
      pendingWrites.push(appendTaskLog(task.cwd, current.stdout_path, message));
      const processed = processOutputLines(stdoutBuffer + message);
      stdoutBuffer = processed.remainder;
      for (const line of processed.lines) {
        maybeRecordCodexSessionId(task.cwd, current, line, pendingWrites);
        pendingWrites.push(appendTaskEvent(task.cwd, current, normalizeCodexOutputLine(current.id, line, "stdout")));
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8");
      if (options.streamToConsole) {
        process.stderr.write(message);
      }
      pendingWrites.push(appendTaskLog(task.cwd, current.stderr_path, message));
      const processed = processOutputLines(stderrBuffer + message);
      stderrBuffer = processed.remainder;
      for (const line of processed.lines) {
        maybeRecordCodexSessionId(task.cwd, current, line, pendingWrites);
        pendingWrites.push(appendTaskEvent(task.cwd, current, normalizeCodexOutputLine(current.id, line, "stderr")));
      }
    });

    child.on("error", (error) => {
      pendingWrites.push(appendTaskEvent(task.cwd, current, {
        time: new Date().toISOString(),
        task_id: current.id,
        type: "task.error",
        message: error.message
      }));
      void Promise.allSettled(pendingWrites).then(() => updateTask(task.cwd, current.id, { error: error.message })).then((updated) => {
        void markTaskStatus(task.cwd, updated, "failed", error.message).then(resolve);
      });
    });

    child.on("close", (code) => {
      if (stdoutBuffer.length > 0) {
        maybeRecordCodexSessionId(task.cwd, current, stdoutBuffer, pendingWrites);
        pendingWrites.push(appendTaskEvent(task.cwd, current, normalizeCodexOutputLine(current.id, stdoutBuffer, "stdout")));
      }
      if (stderrBuffer.length > 0) {
        maybeRecordCodexSessionId(task.cwd, current, stderrBuffer, pendingWrites);
        pendingWrites.push(appendTaskEvent(task.cwd, current, normalizeCodexOutputLine(current.id, stderrBuffer, "stderr")));
      }
      void Promise.allSettled(pendingWrites)
        .then(() => readTask(task.cwd, current.id))
        .then((latest) => {
          if (latest.status === "cancelled") {
            resolve(latest);
            return;
          }
          void finalizeGitState(task.cwd, executionCwd, current).then((gitPatch) => updateTask(task.cwd, current.id, { exit_code: code, ...gitPatch })).then((updated) => {
            const status = code === 0 ? "succeeded" : "failed";
            return markTaskStatus(task.cwd, updated, status, `Codex exited with code ${code ?? "unknown"}`).then(resolve);
          });
        });
    });
  });
}

async function finalizeGitState(projectRoot: string, executionCwd: string, task: TaskRecord): Promise<Partial<TaskRecord>> {
  const afterSnapshot = await readGitSnapshot(executionCwd);
  if (!afterSnapshot.available) {
    await appendTaskEvent(projectRoot, task, {
      time: new Date().toISOString(),
      task_id: task.id,
      type: "git.unavailable",
      message: "git status unavailable after task"
    });
    return {
      git_available: false,
      changed_files: [],
      touched_files: [],
      conflict_risk: false
    };
  }

  const baseFiles = task.base_changed_files ?? [];
  const newChangedFiles = diffChangedFiles(baseFiles, afterSnapshot.files);
  const retainedDirtyFiles = afterSnapshot.files.filter((file) => baseFiles.includes(file));
  const changedFiles = afterSnapshot.files;
  const touchedFiles = mergeFiles(newChangedFiles, retainedDirtyFiles);
  const conflictRisk = retainedDirtyFiles.length > 0;

  await appendTaskEvent(projectRoot, task, {
    time: new Date().toISOString(),
    task_id: task.id,
    type: "git.changed_files",
    message: newChangedFiles.length > 0 ? newChangedFiles.join(", ") : "no new changed files",
    raw: {
      base_changed_files: baseFiles,
      changed_files: changedFiles,
      new_changed_files: newChangedFiles,
      touched_files: touchedFiles,
      conflict_risk: conflictRisk
    }
  });

  return {
    git_available: true,
    changed_files: changedFiles,
    new_changed_files: newChangedFiles,
    touched_files: touchedFiles,
    conflict_risk: conflictRisk
  };
}

function maybeRecordCodexSessionId(
  projectRoot: string,
  task: TaskRecord,
  line: string,
  pendingWrites: Promise<void>[]
): void {
  if (task.codex_session_id) {
    return;
  }

  const sessionId = extractCodexSessionId(line);
  if (!sessionId) {
    return;
  }

  task.codex_session_id = sessionId;
  pendingWrites.push(
    updateTask(projectRoot, task.id, { codex_session_id: sessionId })
      .then((updated) => appendTaskEvent(projectRoot, updated, {
        time: new Date().toISOString(),
        task_id: task.id,
        type: "codex.session",
        message: sessionId
      }))
  );
}

function extractCodexSessionId(line: string): string | undefined {
  try {
    const raw = JSON.parse(line) as unknown;
    if (!isRecord(raw)) {
      return undefined;
    }

    const topLevel = firstString(raw.session_id, raw.thread_id, raw.conversation_id);
    if (topLevel) {
      return topLevel;
    }

    const payload = raw.payload;
    if (isRecord(payload)) {
      if (raw.type === "session_meta") {
        return firstString(payload.id, payload.session_id, payload.thread_id);
      }
      return firstString(payload.session_id, payload.thread_id, payload.conversation_id);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getExecutionCwd(task: TaskRecord): string {
  return task.execution_cwd ?? task.cwd;
}

function processOutputLines(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split(/\r?\n/);
  const remainder = parts.pop() ?? "";
  return {
    lines: parts.filter((line) => line.length > 0),
    remainder
  };
}

function normalizeCodexOutputLine(taskId: string, line: string, fallbackType: "stdout" | "stderr"): TaskEvent {
  const time = new Date().toISOString();

  try {
    const raw = JSON.parse(line) as unknown;
    if (isRecord(raw)) {
      const rawType = firstString(raw.type, raw.event, raw.name) ?? fallbackType;
      return {
        time,
        task_id: taskId,
        type: mapCodexEventType(rawType),
        message: extractMessage(raw) ?? line,
        raw
      };
    }
  } catch {
    // Plain text output is expected when --json is disabled or a runner writes non-JSON diagnostics.
  }

  return {
    time,
    task_id: taskId,
    type: fallbackType,
    message: line
  };
}

function mapCodexEventType(rawType: string): string {
  const normalized = rawType.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  if (/agent.*message|assistant.*message|message.*delta|response.*output/.test(normalized)) {
    return "agent.message";
  }
  if (/tool.*call|function.*call|command.*start/.test(normalized)) {
    return "tool.call";
  }
  if (/tool.*result|function.*result|command.*end/.test(normalized)) {
    return "tool.result";
  }
  if (/error|failed/.test(normalized)) {
    return "task.error";
  }
  return `codex.${normalized}`;
}

function extractMessage(raw: Record<string, unknown>): string | undefined {
  for (const key of ["message", "text", "content", "delta", "summary"]) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const nested = raw.item ?? raw.data ?? raw.payload;
  if (isRecord(nested)) {
    return extractMessage(nested);
  }

  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

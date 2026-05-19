import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertCanCall, getMember, getMemberPaths, loadProject } from "./config.js";
import { CofounderError } from "./errors.js";
import { applyGitPatch, checkGitPatch, createWorktreePatch } from "./git.js";
import { findRecentCodexSessionId } from "./codexSessions.js";
import { prepareMemberRuntime } from "./memberRuntime.js";
import { assemblePrompt } from "./prompt.js";
import { pathExists } from "./paths.js";
import { appendTaskEvent, createTask, markTaskStatus, readTask, resolveTaskRecordPath, updateTask } from "./tasks.js";
import { CODEX_CAPABILITIES, runCodexTask } from "./codex.js";
import type { LoadedProject, MemberSettings, RunnerCapabilities, TaskEvent, TaskRecord, WorkMode } from "./types.js";

export interface TeamMemberSummary {
  id: string;
  title: string;
  runner: "codex";
  home_path: string | null;
  settings_path: string;
  responsibilities: string[];
  can_call: string[];
}

export interface TeamSummary {
  id?: string;
  name?: string;
  project_root: string;
  members: TeamMemberSummary[];
}

export interface LogEntry extends TaskEvent {
  raw_line: string;
}

export interface ApplyTaskResult {
  task: TaskRecord;
  files: string[];
  patch_path: string;
}

export interface TaskResultView {
  task: TaskRecord;
  result: string;
  result_empty: boolean;
  result_truncated: boolean;
  timed_out: boolean;
  recent_logs: LogEntry[];
}

export function getCapabilities(): RunnerCapabilities[] {
  return [CODEX_CAPABILITIES];
}

export async function listTeam(startDir = process.cwd()): Promise<TeamSummary> {
  const project = await loadProject(startDir);
  return {
    id: project.team.team?.id,
    name: project.team.team?.name,
    project_root: project.projectRoot,
    members: Object.values(project.team.members).map((member) => {
      const paths = getMemberPaths(project, member);
      return {
        id: member.id,
        title: member.title,
        runner: member.runner,
        home_path: paths.homePath,
        settings_path: paths.settingsPath,
        responsibilities: member.responsibilities,
        can_call: member.can_call
      };
    })
  };
}

export async function runMember(
  memberId: string,
  task: string,
  options: { caller?: string; startDir?: string; streamToConsole?: boolean } = {}
): Promise<TaskRecord> {
  const project = await loadProject(options.startDir);
  const caller = options.caller ?? "lead";
  const member = getMember(project, memberId);
  const runtime = await prepareMemberRuntime(project, member);
  const workMode = getWorkMode(runtime.settings);
  const prompt = await assemblePrompt(project, runtime.member, runtime.settings, caller, task);
  const record = await createTask(project, {
    caller,
    assignee: memberId,
    task,
    mode: "run",
    member_home_path: runtime.member_home_path,
    member_prompt_path: runtime.member_prompt_path,
    member_settings_path: runtime.member_settings_path,
    member_effective_config_path: runtime.member_effective_config_path,
    member_codex_config_path: runtime.member_codex_config_path,
    work_mode: workMode
  }, prompt);
  return await runCodexTask(record, runtime.member, runtime.settings, { streamToConsole: options.streamToConsole, codexConfig: runtime.codex_config });
}

export async function delegateMember(
  memberId: string,
  task: string,
  options: { caller?: string; startDir?: string } = {}
): Promise<TaskRecord> {
  const project = await loadProject(options.startDir);
  const caller = options.caller ?? "lead";
  assertCanCall(project, caller, memberId);

  const member = getMember(project, memberId);
  const runtime = await prepareMemberRuntime(project, member);
  const workMode = getWorkMode(runtime.settings);
  const prompt = await assemblePrompt(project, runtime.member, runtime.settings, caller, task);
  const record = await createTask(project, {
    caller,
    assignee: memberId,
    task,
    mode: "delegate",
    member_home_path: runtime.member_home_path,
    member_prompt_path: runtime.member_prompt_path,
    member_settings_path: runtime.member_settings_path,
    member_effective_config_path: runtime.member_effective_config_path,
    member_codex_config_path: runtime.member_codex_config_path,
    work_mode: workMode
  }, prompt);
  await startWorker(project, record);
  return await readTask(project.projectRoot, record.id);
}

export async function runWorkerTask(taskId: string, startDir = process.cwd()): Promise<TaskRecord> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);
  const member = getMember(project, task.assignee);
  const runtime = await prepareMemberRuntime(project, member);
  return await runCodexTask(task, runtime.member, runtime.settings, { codexConfig: runtime.codex_config });
}

export async function getTask(taskId: string, startDir = process.cwd()): Promise<TaskRecord> {
  const project = await loadProject(startDir);
  return await readTask(project.projectRoot, taskId);
}

export async function readTaskLogs(taskId: string, options: { startDir?: string; tail?: number } = {}): Promise<LogEntry[]> {
  const project = await loadProject(options.startDir);
  const task = await readTask(project.projectRoot, taskId);
  const content = await readFile(resolveTaskRecordPath(project.projectRoot, task, "events_path"), "utf8");
  const entries = content
    .split("\n")
    .filter(Boolean)
    .map((line) => parseLogLine(line));
  return entries.slice(-(options.tail ?? 50));
}

export async function readTaskEventContent(taskId: string, startDir = process.cwd()): Promise<string> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);
  return await readFile(resolveTaskRecordPath(project.projectRoot, task, "events_path"), "utf8");
}

export async function readTaskResult(taskId: string, startDir = process.cwd()): Promise<string> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);
  return await readFile(resolveTaskRecordPath(project.projectRoot, task, "result_path"), "utf8");
}

export async function getTaskResultView(
  taskId: string,
  options: { startDir?: string; maxChars?: number; tail?: number; timedOut?: boolean } = {}
): Promise<TaskResultView> {
  const project = await loadProject(options.startDir);
  const task = await readTask(project.projectRoot, taskId);
  return await buildTaskResultView(project.projectRoot, task, options);
}

export async function waitForTaskResult(
  taskId: string,
  options: { startDir?: string; timeoutMs?: number; pollIntervalMs?: number; maxChars?: number; tail?: number } = {}
): Promise<TaskResultView> {
  const project = await loadProject(options.startDir);
  const timeoutMs = clampInt(options.timeoutMs ?? 45_000, 1, 110_000);
  const pollIntervalMs = clampInt(options.pollIntervalMs ?? 1_000, 100, 10_000);
  const deadline = Date.now() + timeoutMs;
  let task = await readTask(project.projectRoot, taskId);

  while (!isTerminalStatus(task.status) && Date.now() < deadline) {
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    task = await readTask(project.projectRoot, taskId);
  }

  return await buildTaskResultView(project.projectRoot, task, {
    maxChars: options.maxChars,
    tail: options.tail,
    timedOut: !isTerminalStatus(task.status)
  });
}

export async function readTaskPatch(taskId: string, startDir = process.cwd()): Promise<string> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);
  assertWorktreeTask(task);
  const generated = await createWorktreePatch(task.execution_cwd);
  return generated.patch;
}

export async function applyTaskPatch(taskId: string, startDir = process.cwd()): Promise<ApplyTaskResult> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);
  assertWorktreeTask(task);

  const generated = await createWorktreePatch(task.execution_cwd);
  if (generated.patch.trim().length === 0) {
    throw new CofounderError(`No worktree changes to apply for task ${taskId}`);
  }

  const patchPath = path.join(".cofounder", "runs", task.id, "apply.patch");
  await writeFile(path.join(project.projectRoot, patchPath), generated.patch, "utf8");
  await checkGitPatch(project.projectRoot, generated.patch);
  await applyGitPatch(project.projectRoot, generated.patch);

  const updated = await updateTask(project.projectRoot, task.id, {
    apply_patch_path: patchPath,
    applied_at: new Date().toISOString(),
    applied_files: generated.files
  });

  await appendTaskEvent(project.projectRoot, updated, {
    time: new Date().toISOString(),
    task_id: updated.id,
    type: "git.worktree.applied",
    message: generated.files.length > 0 ? generated.files.join(", ") : "patch applied",
    raw: {
      files: generated.files,
      patch_path: patchPath
    }
  });

  return {
    task: updated,
    files: generated.files,
    patch_path: patchPath
  };
}

export async function cancelTask(taskId: string, startDir = process.cwd()): Promise<TaskRecord> {
  const project = await loadProject(startDir);
  const task = await readTask(project.projectRoot, taskId);

  if (["succeeded", "failed", "cancelled"].includes(task.status)) {
    return task;
  }

  tryKill(task.runner_pid);
  tryKill(task.worker_pid);
  tryKillProcessGroup(task.worker_pid);

  return await markTaskStatus(project.projectRoot, task, "cancelled", "Task cancelled");
}

export async function interruptTask(taskId: string, message: string, startDir = process.cwd()): Promise<TaskRecord> {
  const project = await loadProject(startDir);
  let task = await readTask(project.projectRoot, taskId);
  if (!["queued", "running", "waiting"].includes(task.status)) {
    throw new CofounderError(`Task ${taskId} is already ${task.status}`);
  }
  if (!task.codex_session_id) {
    const discoveredSessionId = await findRecentCodexSessionId({
      cwd: task.execution_cwd,
      since: task.started_at ?? task.created_at
    });
    if (discoveredSessionId) {
      task = await updateTask(project.projectRoot, task.id, { codex_session_id: discoveredSessionId });
    }
  }
  if (!task.codex_session_id) {
    throw new CofounderError(`Task ${taskId} has no Codex session id yet; try again after Codex starts`);
  }

  const member = getMember(project, task.assignee);
  const runtime = await prepareMemberRuntime(project, member);
  await cancelTask(taskId, startDir);

  const record = await createTask(project, {
    caller: task.caller,
    assignee: task.assignee,
    task: message,
    mode: "interrupt",
    member_home_path: runtime.member_home_path,
    member_prompt_path: runtime.member_prompt_path,
    member_settings_path: runtime.member_settings_path,
    member_effective_config_path: runtime.member_effective_config_path,
    member_codex_config_path: runtime.member_codex_config_path,
    work_mode: task.work_mode,
    execution_cwd: task.execution_cwd,
    worktree_path: task.worktree_path,
    codex_resume_session_id: task.codex_session_id,
    interrupted_task_id: task.id,
    interrupt_message: message
  }, buildInterruptPrompt(task, message));
  await startWorker(project, record);
  return await readTask(project.projectRoot, record.id);
}

export function formatTaskStatus(task: TaskRecord): string {
  const lines = [
    `${task.id} ${task.status}`,
    `assignee: ${task.assignee}`,
    `caller: ${task.caller}`,
    `created: ${task.created_at}`
  ];
  if (task.started_at) {
    lines.push(`started: ${task.started_at}`);
  }
  if (task.finished_at) {
    lines.push(`finished: ${task.finished_at}`);
  }
  if (task.exit_code !== undefined) {
    lines.push(`exit_code: ${task.exit_code}`);
  }
  if (task.error) {
    lines.push(`error: ${task.error}`);
  }
  if (task.codex_session_id) {
    lines.push(`codex_session_id: ${task.codex_session_id}`);
  }
  if (task.codex_resume_session_id) {
    lines.push(`codex_resume_session_id: ${task.codex_resume_session_id}`);
  }
  if (task.interrupted_task_id) {
    lines.push(`interrupted_task_id: ${task.interrupted_task_id}`);
  }
  if (task.applied_at) {
    lines.push(`applied: ${task.applied_at}`);
    lines.push(`applied_files: ${task.applied_files.length > 0 ? task.applied_files.join(", ") : "none"}`);
    lines.push(`apply_patch: ${task.apply_patch_path ?? "none"}`);
  }
  lines.push(`git_available: ${task.git_available === null ? "unknown" : String(task.git_available)}`);
  lines.push(`work_mode: ${task.work_mode}`);
  lines.push(`execution_cwd: ${task.execution_cwd}`);
  if (task.worktree_path) {
    lines.push(`worktree: ${task.worktree_path}`);
  }
  lines.push(`changed_files: ${task.changed_files.length > 0 ? task.changed_files.join(", ") : "none"}`);
  lines.push(`new_changed_files: ${task.new_changed_files.length > 0 ? task.new_changed_files.join(", ") : "none"}`);
  lines.push(`conflict_risk: ${task.conflict_risk ? "yes" : "no"}`);
  lines.push(`result: ${task.result_path}`);
  lines.push(`events: ${task.events_path}`);
  lines.push(`cwd: ${task.cwd}`);
  lines.push(`member_home: ${task.member_home_path ?? "none"}`);
  lines.push(`member_settings: ${task.member_settings_path}`);
  lines.push(`member_effective_config: ${task.member_effective_config_path ?? "none"}`);
  lines.push(`member_codex_config: ${task.member_codex_config_path ?? "none"}`);
  return lines.join("\n");
}

function getWorkMode(settings: MemberSettings): WorkMode {
  const mode = settings.write?.mode ?? "direct";
  if (mode !== "direct" && mode !== "worktree") {
    throw new CofounderError(`Unsupported write.mode "${String(mode)}"; expected "direct" or "worktree"`);
  }
  return mode;
}

function assertWorktreeTask(task: TaskRecord): void {
  if (task.work_mode !== "worktree" || !task.worktree_path) {
    throw new CofounderError(`Task ${task.id} was not run in worktree mode`);
  }
  if (["queued", "running", "waiting"].includes(task.status)) {
    throw new CofounderError(`Task ${task.id} is still ${task.status}`);
  }
}

function buildInterruptPrompt(task: TaskRecord, message: string): string {
  return `# Cofounder Interrupt

The previous task ${task.id} was cancelled by the caller.

Continue the same Codex session with this revised instruction:

${message}
`;
}

export function formatLogEntry(entry: LogEntry): string {
  const message = entry.message ? ` ${entry.message.replace(/\n+$/g, "")}` : "";
  return `[${entry.time ?? "unknown"}] ${entry.type ?? "event"}${message}`;
}

export function formatTaskResultPayload(view: TaskResultView): Record<string, unknown> {
  const terminal = isTerminalStatus(view.task.status);
  return {
    task_id: view.task.id,
    status: view.task.status,
    assignee: view.task.assignee,
    caller: view.task.caller,
    terminal,
    still_running: !terminal,
    exit_code: view.task.exit_code ?? null,
    error: view.task.error ?? null,
    timed_out: view.timed_out,
    next_action: formatTaskResultNextAction(view, terminal),
    result_empty: view.result_empty,
    result_truncated: view.result_truncated,
    result_path: view.task.result_path,
    events_path: view.task.events_path,
    changed_files: view.task.changed_files,
    new_changed_files: view.task.new_changed_files,
    conflict_risk: view.task.conflict_risk,
    result: view.result,
    recent_events: view.recent_logs.map(formatLogEntry)
  };
}

function formatTaskResultNextAction(view: TaskResultView, terminal: boolean): string {
  if (view.timed_out && !terminal) {
    return "Task is still running. Inspect recent_events and call team.wait again, or use team.interrupt/team.cancel if it is stuck or needs steering.";
  }

  if (!terminal) {
    return "Task is still running. Continue monitoring before treating delegated work as complete.";
  }

  if (view.task.status === "succeeded" && view.result_empty) {
    return "Task succeeded but result is empty. Inspect recent_events/logs before relying on it.";
  }

  if (view.task.status === "succeeded") {
    return "Read result and inspect any worktree diff before applying changes.";
  }

  return "Task did not produce successful delegated work. Inspect error and recent_events.";
}

async function buildTaskResultView(
  projectRoot: string,
  task: TaskRecord,
  options: { maxChars?: number; tail?: number; timedOut?: boolean }
): Promise<TaskResultView> {
  const rawResult = await readFile(resolveTaskRecordPath(projectRoot, task, "result_path"), "utf8");
  const maxChars = clampInt(options.maxChars ?? 12_000, 1, 50_000);
  const resultTruncated = rawResult.length > maxChars;
  const result = resultTruncated ? rawResult.slice(0, maxChars) : rawResult;
  const logs = await readTaskLogs(task.id, { startDir: projectRoot, tail: options.tail ?? 80 });

  return {
    task,
    result,
    result_empty: rawResult.trim().length === 0,
    result_truncated: resultTruncated,
    timed_out: options.timedOut === true,
    recent_logs: logs
  };
}

function isTerminalStatus(status: TaskRecord["status"]): boolean {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatTeam(summary: TeamSummary): string {
  const lines = [summary.name ?? summary.id ?? "Team"];
  for (const member of summary.members) {
    lines.push("");
    lines.push(`${member.id}: ${member.title}`);
    lines.push(`  runner: ${member.runner}`);
    lines.push(`  home: ${member.home_path ?? "none"}`);
    lines.push(`  settings: ${member.settings_path}`);
    lines.push(`  can_call: ${member.can_call.length > 0 ? member.can_call.join(", ") : "none"}`);
    lines.push("  responsibilities:");
    for (const responsibility of member.responsibilities) {
      lines.push(`    - ${responsibility}`);
    }
  }
  return lines.join("\n");
}

async function startWorker(project: LoadedProject, record: TaskRecord): Promise<void> {
  const worker = await resolveWorkerCommand(record.id);
  const child = spawn(worker.command, worker.args, {
    cwd: project.projectRoot,
    env: process.env,
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  await updateTask(project.projectRoot, record.id, { worker_pid: child.pid });
}

async function resolveWorkerCommand(taskId: string): Promise<{ command: string; args: string[] }> {
  const workerJs = fileURLToPath(new URL("./worker.js", import.meta.url));
  if (await pathExists(workerJs)) {
    return { command: process.execPath, args: [workerJs, taskId] };
  }

  const workerTs = fileURLToPath(new URL("./worker.ts", import.meta.url));
  const tsxBin = path.resolve(path.dirname(workerTs), "../node_modules/.bin/tsx");
  if (await pathExists(workerTs) && await pathExists(tsxBin)) {
    return { command: tsxBin, args: [workerTs, taskId] };
  }

  throw new CofounderError("Could not resolve Cofounder worker entrypoint");
}

function parseLogLine(line: string): LogEntry {
  try {
    return {
      ...(JSON.parse(line) as TaskEvent),
      raw_line: line
    };
  } catch {
    return {
      time: new Date(0).toISOString(),
      task_id: "unknown",
      type: "raw",
      message: line,
      raw_line: line
    };
  }
}

function tryKill(pid: number | undefined): void {
  if (!pid || pid <= 0) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The process may have already exited; cancellation remains idempotent.
  }
}

function tryKillProcessGroup(pid: number | undefined): void {
  if (!pid || pid <= 0 || process.platform === "win32") {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Detached workers may already have exited, and direct process kill above is enough then.
  }
}

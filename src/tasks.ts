import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { createGitWorktree } from "./git.js";
import type { CreateTaskInput, LoadedProject, TaskEvent, TaskRecord, TaskStatus } from "./types.js";

export async function createTask(project: LoadedProject, input: CreateTaskInput, prompt: string): Promise<TaskRecord> {
  const id = createTaskId(input.assignee);
  const runDir = taskRunDir(project.projectRoot, id);
  const workMode = input.work_mode;
  const worktreeAbsolutePath = workMode === "worktree" && !input.execution_cwd
    ? path.join(project.projectRoot, ".cofounder", "worktrees", id)
    : null;
  const executionCwd = input.execution_cwd ?? worktreeAbsolutePath ?? project.projectRoot;

  await mkdir(runDir, { recursive: true });
  if (worktreeAbsolutePath) {
    await createGitWorktree(project.projectRoot, worktreeAbsolutePath);
  }

  const record: TaskRecord = {
    id,
    status: "queued",
    caller: input.caller,
    assignee: input.assignee,
    runner: "codex",
    cwd: project.projectRoot,
    execution_cwd: executionCwd,
    work_mode: workMode,
    worktree_path: input.worktree_path ?? (worktreeAbsolutePath ? relative(project.projectRoot, worktreeAbsolutePath) : null),
    codex_session_id: null,
    codex_resume_session_id: input.codex_resume_session_id ?? null,
    interrupted_task_id: input.interrupted_task_id ?? null,
    interrupt_message: input.interrupt_message ?? null,
    config_root: project.configRoot,
    member_home_path: input.member_home_path ?? null,
    member_prompt_path: input.member_prompt_path,
    member_settings_path: input.member_settings_path,
    member_effective_config_path: input.member_effective_config_path ?? null,
    member_codex_config_path: input.member_codex_config_path ?? null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    prompt_path: relative(project.projectRoot, path.join(runDir, "prompt.md")),
    events_path: relative(project.projectRoot, path.join(runDir, "events.jsonl")),
    stdout_path: relative(project.projectRoot, path.join(runDir, "stdout.log")),
    stderr_path: relative(project.projectRoot, path.join(runDir, "stderr.log")),
    result_path: relative(project.projectRoot, path.join(runDir, "result.md")),
    git_available: null,
    base_changed_files: [],
    changed_files: [],
    new_changed_files: [],
    touched_files: [],
    conflict_risk: false,
    worktree_patch_path: null,
    worktree_patch_files: [],
    worktree_removed_at: null,
    worktree_cleanup_error: null,
    apply_patch_path: null,
    applied_at: null,
    applied_files: []
  };

  await writeFile(path.join(runDir, "prompt.md"), prompt, "utf8");
  await writeFile(path.join(runDir, "stdout.log"), "", "utf8");
  await writeFile(path.join(runDir, "stderr.log"), "", "utf8");
  await writeFile(path.join(runDir, "result.md"), "", "utf8");
  await writeTask(project.projectRoot, record);
  await appendTaskEvent(project.projectRoot, record, {
    time: new Date().toISOString(),
    task_id: record.id,
    type: "task.created",
    message: `${input.mode} task created for ${input.assignee} (${workMode} mode)`
  });
  if (worktreeAbsolutePath) {
    await appendTaskEvent(project.projectRoot, record, {
      time: new Date().toISOString(),
      task_id: record.id,
      type: "git.worktree.created",
      message: record.worktree_path ?? worktreeAbsolutePath
    });
  }

  return record;
}

export async function readTask(projectRoot: string, taskId: string): Promise<TaskRecord> {
  const raw = await readFile(path.join(taskRunDir(projectRoot, taskId), "task.json"), "utf8");
  return JSON.parse(raw) as TaskRecord;
}

export async function writeTask(projectRoot: string, record: TaskRecord): Promise<void> {
  await writeFile(path.join(taskRunDir(projectRoot, record.id), "task.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function updateTask(
  projectRoot: string,
  taskId: string,
  patch: Partial<TaskRecord>
): Promise<TaskRecord> {
  const record = await readTask(projectRoot, taskId);
  const next = { ...record, ...patch };
  await writeTask(projectRoot, next);
  return next;
}

export async function appendTaskEvent(projectRoot: string, record: TaskRecord, event: TaskEvent): Promise<void> {
  await appendFile(path.resolve(projectRoot, record.events_path), `${JSON.stringify(event)}\n`, "utf8");
}

export async function appendTaskLog(projectRoot: string, relativePath: string, chunk: string): Promise<void> {
  await appendFile(path.resolve(projectRoot, relativePath), chunk, "utf8");
}

export async function markTaskStatus(projectRoot: string, record: TaskRecord, status: TaskStatus, message?: string): Promise<TaskRecord> {
  const now = new Date().toISOString();
  const patch: Partial<TaskRecord> = { status };
  if (status === "running" && !record.started_at) {
    patch.started_at = now;
  }
  if (["succeeded", "failed", "cancelled"].includes(status)) {
    patch.finished_at = now;
  }
  const updated = await updateTask(projectRoot, record.id, patch);
  await appendTaskEvent(projectRoot, updated, {
    time: now,
    task_id: record.id,
    type: "task.status",
    message: message ?? status
  });
  return updated;
}

export function taskRunDir(projectRoot: string, taskId: string): string {
  return path.join(projectRoot, ".cofounder", "runs", taskId);
}

export function resolveTaskRecordPath(projectRoot: string, record: TaskRecord, key: "events_path" | "result_path" | "stdout_path" | "stderr_path" | "prompt_path"): string {
  return path.resolve(projectRoot, record[key]);
}

function createTaskId(assignee: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  const suffix = crypto.randomBytes(2).toString("hex");
  return `tsk_${stamp}_${safeId(assignee)}_${suffix}`;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function relative(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath);
}

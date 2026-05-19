export type TaskStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export type RunnerName = "codex";

export type WorkMode = "direct" | "worktree";

export type ProjectContextMode = "auto" | "manual";

export interface TeamFile {
  version: number;
  team?: {
    id?: string;
    name?: string;
  };
  project_context: {
    mode: ProjectContextMode;
    file: string;
  };
  defaults?: {
    runner?: RunnerName;
    cwd?: "inherit";
    run_mode?: "sync" | "async";
  };
  members: Record<string, MemberDefinition>;
}

export interface MemberDefinition {
  id: string;
  title: string;
  runner: RunnerName;
  prompt: string;
  settings: string;
  home?: string;
  responsibilities: string[];
  can_call: string[];
}

export interface LoadedProject {
  projectRoot: string;
  configRoot: string;
  team: TeamFile;
}

export interface MemberSettings {
  model?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approval?: "untrusted" | "on-request" | "never" | string;
  reasoning_effort?: "low" | "medium" | "high" | "xhigh" | string;
  live_interrupt?: boolean;
  write?: {
    mode?: WorkMode;
  };
  mcp?: {
    mode?: "inherit" | "none" | "allowlist" | "isolated";
    allow?: string[];
    from_main?: string[];
    team?: string[];
    config_path?: string;
    include_inline_env?: boolean;
  };
  skills?: {
    mode?: "inherit" | "none" | "allowlist" | "isolated";
    from_project?: string[];
    from_main?: string[];
    team?: string[];
    roots?: string[];
    max_bytes?: number;
  };
  memory?: {
    project?: boolean;
    member?: boolean;
    max_snippets?: number;
  };
  runner?: {
    codex?: {
      json?: boolean;
      extra_args?: string[];
      use_member_home?: boolean;
      include_project_doc?: boolean;
    };
  };
}

export interface CreateTaskInput {
  caller: string;
  assignee: string;
  task: string;
  mode: "run" | "delegate" | "interrupt";
  member_home_path: string | null;
  member_prompt_path: string;
  member_settings_path: string;
  member_effective_config_path: string | null;
  member_codex_config_path: string | null;
  work_mode: WorkMode;
  execution_cwd?: string;
  worktree_path?: string | null;
  codex_resume_session_id?: string | null;
  interrupted_task_id?: string | null;
  interrupt_message?: string | null;
}

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  caller: string;
  assignee: string;
  runner: RunnerName;
  cwd: string;
  execution_cwd: string;
  work_mode: WorkMode;
  worktree_path: string | null;
  codex_session_id: string | null;
  codex_resume_session_id: string | null;
  interrupted_task_id: string | null;
  interrupt_message: string | null;
  config_root: string;
  member_home_path: string | null;
  member_prompt_path: string;
  member_settings_path: string;
  member_effective_config_path: string | null;
  member_codex_config_path: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  prompt_path: string;
  events_path: string;
  stdout_path: string;
  stderr_path: string;
  result_path: string;
  git_available: boolean | null;
  base_changed_files: string[];
  changed_files: string[];
  new_changed_files: string[];
  touched_files: string[];
  conflict_risk: boolean;
  apply_patch_path: string | null;
  applied_at: string | null;
  applied_files: string[];
  worker_pid?: number;
  runner_pid?: number;
  exit_code?: number | null;
  error?: string;
}

export interface TaskEvent {
  time: string;
  task_id: string;
  type: string;
  message?: string;
  raw?: unknown;
}

export interface RunnerCapabilities {
  runner: RunnerName;
  async_tasks: boolean;
  watch: boolean;
  cancel: boolean;
  live_interrupt: boolean;
  interrupt_mode: "unsupported" | "live" | "cancel-resume";
  normalized_events: boolean;
  member_home: boolean;
}

export interface CodexCommand {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

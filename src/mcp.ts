#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { CofounderError } from "./errors.js";
import {
  applyTaskPatch,
  cancelTask,
  delegateMember,
  formatLogEntry,
  formatTaskResultPayload,
  formatTaskStatus,
  formatTeam,
  getCapabilities,
  getTaskResultView,
  getTask,
  interruptTask,
  listTeam,
  readTaskPatch,
  readTaskLogs,
  waitForTaskResult
} from "./runtime.js";

export function createCofounderMcpServer(): McpServer {
  const server = new McpServer({
    name: "cofounder",
    version: "0.1.0"
  });

  registerTools(server);
  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createCofounderMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function registerTools(server: McpServer): void {
  server.registerTool(
    "team.list",
    {
      title: "List Cofounder team",
      description: "List the project-local Cofounder team members and responsibilities.",
      inputSchema: {}
    },
    async () => textResult(formatTeam(await listTeam()))
  );

  server.registerTool(
    "team.delegate",
    {
      title: "Delegate task",
      description: "Start an async task for a Codex-backed team member. Use team.wait or team.result before treating the delegated work as complete.",
      inputSchema: {
        assignee: z.string().min(1),
        task: z.string().min(1),
        caller: z.string().min(1).optional()
      }
    },
    async ({ assignee, task, caller }) => {
      const record = await delegateMember(assignee, task, { caller });
      return jsonTextResult({
        task_id: record.id,
        status: record.status,
        assignee: record.assignee,
        work_mode: record.work_mode,
        worktree_path: record.worktree_path,
        result_path: record.result_path,
        events_path: record.events_path
      });
    }
  );

  server.registerTool(
    "team.wait",
    {
      title: "Wait for task result",
      description: "Wait until a delegated task finishes, fails, or times out, then return status, result text, and recent logs.",
      inputSchema: {
        task_id: z.string().min(1),
        timeout_ms: z.number().int().positive().max(600_000).optional(),
        poll_interval_ms: z.number().int().positive().max(10_000).optional(),
        max_chars: z.number().int().positive().max(50_000).optional(),
        tail: z.number().int().positive().max(500).optional()
      }
    },
    async ({ task_id, timeout_ms, poll_interval_ms, max_chars, tail }) => {
      const view = await waitForTaskResult(task_id, {
        timeoutMs: timeout_ms,
        pollIntervalMs: poll_interval_ms,
        maxChars: max_chars,
        tail
      });
      return jsonTextResult(formatTaskResultPayload(view));
    }
  );

  server.registerTool(
    "team.result",
    {
      title: "Read task result",
      description: "Read a delegated task result with explicit empty/truncated flags and recent logs.",
      inputSchema: {
        task_id: z.string().min(1),
        max_chars: z.number().int().positive().max(50_000).optional(),
        tail: z.number().int().positive().max(500).optional()
      }
    },
    async ({ task_id, max_chars, tail }) => {
      const view = await getTaskResultView(task_id, { maxChars: max_chars, tail });
      return jsonTextResult(formatTaskResultPayload(view));
    }
  );

  server.registerTool(
    "team.status",
    {
      title: "Task status",
      description: "Read the status of a delegated Cofounder task.",
      inputSchema: {
        task_id: z.string().min(1)
      }
    },
    async ({ task_id }) => textResult(formatTaskStatus(await getTask(task_id)))
  );

  server.registerTool(
    "team.logs",
    {
      title: "Task logs",
      description: "Read recent normalized events for a delegated Cofounder task.",
      inputSchema: {
        task_id: z.string().min(1),
        tail: z.number().int().positive().max(500).optional()
      }
    },
    async ({ task_id, tail }) => {
      const entries = await readTaskLogs(task_id, { tail });
      return textResult(entries.map(formatLogEntry).join("\n") || "(no events)");
    }
  );

  server.registerTool(
    "team.diff",
    {
      title: "Task worktree diff",
      description: "Read the generated patch for a worktree-mode Cofounder task.",
      inputSchema: {
        task_id: z.string().min(1)
      }
    },
    async ({ task_id }) => textResult(await readTaskPatch(task_id))
  );

  server.registerTool(
    "team.apply",
    {
      title: "Apply worktree task",
      description: "Apply changes from a worktree-mode Cofounder task to the main project working tree.",
      inputSchema: {
        task_id: z.string().min(1)
      }
    },
    async ({ task_id }) => {
      const result = await applyTaskPatch(task_id);
      return jsonTextResult({
        task_id: result.task.id,
        applied_at: result.task.applied_at,
        patch_path: result.patch_path,
        files: result.files
      });
    }
  );

  server.registerTool(
    "team.capabilities",
    {
      title: "Runner capabilities",
      description: "Show Cofounder runner capabilities, including interruption mode.",
      inputSchema: {}
    },
    async () => jsonTextResult(getCapabilities())
  );

  server.registerTool(
    "team.cancel",
    {
      title: "Cancel task",
      description: "Cancel a running Cofounder task when possible.",
      inputSchema: {
        task_id: z.string().min(1)
      }
    },
    async ({ task_id }) => textResult(formatTaskStatus(await cancelTask(task_id)))
  );

  server.registerTool(
    "team.interrupt",
    {
      title: "Interrupt task",
      description: "Cancel a running task and resume the same Codex session with revised instructions when possible.",
      inputSchema: {
        task_id: z.string().min(1),
        message: z.string().min(1)
      }
    },
    async ({ task_id, message }) => {
      try {
        const record = await interruptTask(task_id, message);
        return jsonTextResult({
          interrupted_task_id: task_id,
          resumed_task_id: record.id,
          status: record.status,
          codex_resume_session_id: record.codex_resume_session_id,
          result_path: record.result_path,
          events_path: record.events_path
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    }
  );
}

function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function jsonTextResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

function errorResult(text: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

if (isMainModule()) {
  startMcpServer().catch((error: unknown) => {
    const message = error instanceof CofounderError ? error.message : error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  return process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
}

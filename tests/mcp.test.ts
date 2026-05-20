import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { initProject } from "../src/init.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("MCP server exposes team tools over stdio", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-"));
  const transport = new StdioClientTransport({
    command: path.join(repoRoot, "node_modules/.bin/tsx"),
    args: [path.join(repoRoot, "src/mcp.ts")],
    cwd: dir,
    stderr: "pipe"
  });
  const client = new Client({ name: "cofounder-test", version: "0.1.0" });

  try {
    await initProject(dir);
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(toolNames, [
      "team.apply",
      "team.cancel",
      "team.capabilities",
      "team.delegate",
      "team.diff",
      "team.interrupt",
      "team.list",
      "team.logs",
      "team.result",
      "team.status",
      "team.wait"
    ]);

    const result = await client.callTool({
      name: "team.list",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;

    assert.equal(content[0]?.type, "text");
    assert.match(content[0]?.text ?? "", /Default Project Team/);
    assert.match(content[0]?.text ?? "", /backend: Backend Engineer/);
    assert.match(content[0]?.text ?? "", /frontend: Frontend Engineer/);
    assert.doesNotMatch(content[0]?.text ?? "", /lead: Lead Engineer/);

    const capabilities = await client.callTool({
      name: "team.capabilities",
      arguments: {}
    });
    assert.match(textContent(capabilities), /"live_interrupt": false/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP team.delegate starts a delegated Codex task", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-delegate-"));
  const fakeBin = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-fake-bin-"));
  const fakeCodexPath = path.join(fakeBin, "codex");
  await writeFile(fakeCodexPath, fakeCodexScript(), "utf8");
  await chmod(fakeCodexPath, 0o755);

  const transport = new StdioClientTransport({
    command: path.join(repoRoot, "node_modules/.bin/tsx"),
    args: [path.join(repoRoot, "src/mcp.ts")],
    cwd: dir,
    env: testEnv({ PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}` }),
    stderr: "pipe"
  });
  const client = new Client({ name: "cofounder-test", version: "0.1.0" });

  try {
    await initProject(dir);
    await client.connect(transport);

    const delegateResult = await client.callTool({
      name: "team.delegate",
      arguments: {
        assignee: "backend",
        caller: "primary",
        task: "inspect via MCP"
      }
    });
    const delegateText = textContent(delegateResult);
    const payload = JSON.parse(delegateText) as { task_id: string };
    assert.match(payload.task_id, /^tsk_/);

    const statusText = await pollTaskStatus(client, payload.task_id);
    assert.match(statusText, /succeeded/);

    const waitResult = await client.callTool({
      name: "team.wait",
      arguments: {
        task_id: payload.task_id,
        timeout_ms: 5_000
      }
    });
    const waitPayload = JSON.parse(textContent(waitResult)) as {
      status: string;
      result: string;
      result_empty: boolean;
      timed_out: boolean;
      terminal: boolean;
      still_running: boolean;
      next_action: string;
    };
    assert.equal(waitPayload.status, "succeeded");
    assert.equal(waitPayload.result, "fake result\n");
    assert.equal(waitPayload.result_empty, false);
    assert.equal(waitPayload.timed_out, false);
    assert.equal(waitPayload.terminal, true);
    assert.equal(waitPayload.still_running, false);
    assert.match(waitPayload.next_action, /Read result/);

    const resultResult = await client.callTool({
      name: "team.result",
      arguments: {
        task_id: payload.task_id
      }
    });
    const resultPayload = JSON.parse(textContent(resultResult)) as { status: string; result: string; result_empty: boolean };
    assert.equal(resultPayload.status, "succeeded");
    assert.equal(resultPayload.result, "fake result\n");
    assert.equal(resultPayload.result_empty, false);

    const logsResult = await client.callTool({
      name: "team.logs",
      arguments: {
        task_id: payload.task_id,
        tail: 20
      }
    });
    assert.match(textContent(logsResult), /fake codex received/);
    assert.match(textContent(logsResult), /agent.message/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("MCP team.wait returns running guidance on timeout", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-wait-timeout-"));
  const fakeBin = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-wait-timeout-bin-"));
  const fakeCodexPath = path.join(fakeBin, "codex");
  await writeFile(fakeCodexPath, fakeCodexScript(), "utf8");
  await chmod(fakeCodexPath, 0o755);

  const transport = new StdioClientTransport({
    command: path.join(repoRoot, "node_modules/.bin/tsx"),
    args: [path.join(repoRoot, "src/mcp.ts")],
    cwd: dir,
    env: testEnv({ PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}` }),
    stderr: "pipe"
  });
  const client = new Client({ name: "cofounder-test", version: "0.1.0" });

  try {
    await initProject(dir);
    await client.connect(transport);

    const delegateResult = await client.callTool({
      name: "team.delegate",
      arguments: {
        assignee: "backend",
        caller: "primary",
        task: "stay running"
      }
    });
    const payload = JSON.parse(textContent(delegateResult)) as { task_id: string };

    await pollTaskStatus(client, payload.task_id, /running/);

    const waitResult = await client.callTool({
      name: "team.wait",
      arguments: {
        task_id: payload.task_id,
        timeout_ms: 100,
        poll_interval_ms: 100
      }
    });
    const waitPayload = JSON.parse(textContent(waitResult)) as {
      status: string;
      timed_out: boolean;
      terminal: boolean;
      still_running: boolean;
      next_action: string;
      recent_events: string[];
    };
    assert.equal(waitPayload.status, "running");
    assert.equal(waitPayload.timed_out, true);
    assert.equal(waitPayload.terminal, false);
    assert.equal(waitPayload.still_running, true);
    assert.match(waitPayload.next_action, /call team\.wait again/);
    assert.ok(waitPayload.recent_events.length > 0);

    await client.callTool({
      name: "team.cancel",
      arguments: {
        task_id: payload.task_id
      }
    });
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("MCP team.cancel cancels a running delegated task", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-cancel-"));
  const fakeBin = await mkdtemp(path.join(os.tmpdir(), "cofounder-mcp-cancel-bin-"));
  const fakeCodexPath = path.join(fakeBin, "codex");
  await writeFile(fakeCodexPath, fakeCodexScript(), "utf8");
  await chmod(fakeCodexPath, 0o755);

  const transport = new StdioClientTransport({
    command: path.join(repoRoot, "node_modules/.bin/tsx"),
    args: [path.join(repoRoot, "src/mcp.ts")],
    cwd: dir,
    env: testEnv({ PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}` }),
    stderr: "pipe"
  });
  const client = new Client({ name: "cofounder-test", version: "0.1.0" });

  try {
    await initProject(dir);
    await client.connect(transport);

    const delegateResult = await client.callTool({
      name: "team.delegate",
      arguments: {
        assignee: "backend",
        caller: "primary",
        task: "stay running until cancelled"
      }
    });
    const payload = JSON.parse(textContent(delegateResult)) as { task_id: string };
    await pollTaskStatus(client, payload.task_id, /running/);

    const cancelResult = await client.callTool({
      name: "team.cancel",
      arguments: {
        task_id: payload.task_id
      }
    });

    assert.match(textContent(cancelResult), /cancelled/);
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});

async function pollTaskStatus(client: Client, taskId: string, pattern = /succeeded|failed|cancelled/): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await client.callTool({
      name: "team.status",
      arguments: {
        task_id: taskId
      }
    });
    const text = textContent(result);
    if (pattern.test(text)) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Task ${taskId} did not finish`);
}

function textContent(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  assert.equal(content[0]?.type, "text");
  return content[0]?.text ?? "";
}

function testEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return { ...env, ...overrides };
}

function fakeCodexScript(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? null : args[outputIndex + 1];
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "agent_message", message: "fake agent message" }));
  console.log(JSON.stringify({ type: "tool_call", message: "fake tool call" }));
  if (input.includes("stay running")) {
    console.log("fake codex ready");
    setInterval(() => {}, 1000);
    return;
  }
  console.log("fake codex received " + input.length + " chars");
  if (outputPath) {
    fs.writeFileSync(outputPath, "fake result\\n", "utf8");
  }
});
`;
}

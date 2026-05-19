#!/usr/bin/env node
import { CofounderError } from "./errors.js";
import { initProject, syncProjectInstructions } from "./init.js";
import { startMcpServer } from "./mcp.js";
import { formatCodexSetup, installCodexMcp } from "./setup.js";
import { listProjectTemplates } from "./templates.js";
import {
  applyTaskPatch,
  cancelTask,
  delegateMember,
  formatLogEntry,
  formatTaskStatus,
  formatTeam,
  getCapabilities,
  getTask,
  interruptTask,
  listTeam,
  readTaskEventContent,
  readTaskLogs,
  readTaskPatch,
  readTaskResult,
  runMember,
  runWorkerTask
} from "./runtime.js";

async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;

  switch (command) {
    case "init":
      await commandInit(args);
      return;
    case "templates":
      commandTemplates();
      return;
    case "setup":
      await commandSetup(args);
      return;
    case "sync":
      await commandSync(args);
      return;
    case "team":
      await commandTeam();
      return;
    case "run":
      await commandRun(args);
      return;
    case "delegate":
      await commandDelegate(args);
      return;
    case "status":
      await commandStatus(args);
      return;
    case "logs":
      await commandLogs(args);
      return;
    case "diff":
      await commandDiff(args);
      return;
    case "apply":
      await commandApply(args);
      return;
    case "watch":
      await commandWatch(args);
      return;
    case "cancel":
      await commandCancel(args);
      return;
    case "interrupt":
      await commandInterrupt(args);
      return;
    case "capabilities":
      commandCapabilities();
      return;
    case "mcp":
      await startMcpServer();
      return;
    case "__worker":
      await commandWorker(args);
      return;
    case "-h":
    case "--help":
    case undefined:
      printHelp();
      return;
    default:
      throw new CofounderError(`Unknown command: ${command}`);
  }
}

async function commandInit(args: string[]): Promise<void> {
  const templateOption = readOption(args, "--template");
  if (args.includes("--template") && !templateOption) {
    throw new CofounderError("Missing --template value");
  }
  const template = templateOption ?? "default";
  const result = await initProject(process.cwd(), { template });
  console.log(`template ${result.template}`);
  for (const item of result.created) {
    console.log(`created ${item}`);
  }
  for (const item of result.skipped) {
    console.log(`skipped ${item}`);
  }
  for (const notice of result.notices) {
    console.log("");
    console.log("Notice:");
    console.log(notice);
  }
}

function commandTemplates(): void {
  for (const template of listProjectTemplates()) {
    console.log(`${template.name}: ${template.description}`);
  }
}

async function commandSetup(args: string[]): Promise<void> {
  const target = requiredArg(args[0], "setup target");
  if (target !== "codex") {
    throw new CofounderError(`Unknown setup target: ${target}`);
  }
  if (args.includes("--install")) {
    const command = await installCodexMcp();
    console.log(`installed ${command}`);
    return;
  }
  console.log(formatCodexSetup());
}

async function commandSync(args: string[]): Promise<void> {
  const target = requiredArg(args[0], "sync target");
  if (target !== "project") {
    throw new CofounderError(`Unknown sync target: ${target}`);
  }
  const result = await syncProjectInstructions();
  console.log(`updated ${result.path}`);
  console.log(`source ${result.source}`);
  console.log(`derived ${result.derived ? "yes" : "no"}`);
}

async function commandTeam(): Promise<void> {
  console.log(formatTeam(await listTeam()));
}

async function commandRun(args: string[]): Promise<void> {
  const { memberId, task, caller } = parseMemberTask(args, { defaultCaller: "lead" });
  const finalRecord = await runMember(memberId, task, { caller, streamToConsole: true });
  await printTaskResult(finalRecord.id);
}

async function commandDelegate(args: string[]): Promise<void> {
  const { memberId, task, caller } = parseMemberTask(args, { defaultCaller: "lead" });
  const record = await delegateMember(memberId, task, { caller });
  console.log(record.id);
}

async function commandStatus(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  console.log(formatTaskStatus(await getTask(taskId)));
}

async function commandLogs(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const tail = Number(readOption(args, "--tail") ?? "50");
  const entries = await readTaskLogs(taskId, { tail });
  for (const entry of entries) {
    console.log(formatLogEntry(entry));
  }
}

async function commandDiff(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const patch = await readTaskPatch(taskId);
  process.stdout.write(patch);
}

async function commandApply(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const result = await applyTaskPatch(taskId);
  console.log(`applied ${result.files.length} file(s) from ${taskId}`);
  console.log(`patch: ${result.patch_path}`);
  if (result.files.length > 0) {
    console.log(`files: ${result.files.join(", ")}`);
  }
}

async function commandWatch(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  let offset = 0;

  while (true) {
    const task = await getTask(taskId);
    const content = await readTaskEventContent(taskId);
    const next = content.slice(offset);
    offset = content.length;
    for (const line of next.split("\n").filter(Boolean)) {
      console.log(formatLogEntry(JSON.parse(line)));
    }
    if (["succeeded", "failed", "cancelled"].includes(task.status)) {
      break;
    }
    await sleep(750);
  }
}

async function commandCancel(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  console.log(formatTaskStatus(await cancelTask(taskId)));
}

async function commandInterrupt(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const message = args.slice(1).join(" ").trim();
  if (!message) {
    throw new CofounderError("Missing interrupt message");
  }
  const record = await interruptTask(taskId, message);
  console.log(record.id);
}

function commandCapabilities(): void {
  console.log(JSON.stringify(getCapabilities(), null, 2));
}

async function commandWorker(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  await runWorkerTask(taskId);
}

async function printTaskResult(taskId: string): Promise<void> {
  const result = await readTaskResult(taskId);
  if (result.trim().length > 0) {
    console.log("\n--- result ---");
    console.log(result.trim());
  }
}

function parseMemberTask(args: string[], options: { defaultCaller: string }): { memberId: string; task: string; caller: string } {
  const caller = readOption(args, "--caller") ?? options.defaultCaller;
  const positional = stripOptions(args, ["--caller"]);
  const memberId = requiredArg(positional[0], "member");
  const task = positional.slice(1).join(" ").trim();
  if (!task) {
    throw new CofounderError("Missing task text");
  }
  return { memberId, task, caller };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function stripOptions(args: string[], optionNames: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (optionNames.includes(args[index])) {
      index += 1;
      continue;
    }
    result.push(args[index]);
  }
  return result;
}

function requiredArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new CofounderError(`Missing ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp(): void {
  console.log(`Usage:
  cofounder init
  cofounder init --template <default|worktree>
  cofounder templates
  cofounder setup codex
  cofounder setup codex --install
  cofounder sync project
  cofounder team
  cofounder run <member> <task>
  cofounder delegate <member> <task> [--caller <member>]
  cofounder status <task_id>
  cofounder logs <task_id> [--tail <n>]
  cofounder diff <task_id>
  cofounder apply <task_id>
  cofounder watch <task_id>
  cofounder cancel <task_id>
  cofounder interrupt <task_id> <message>
  cofounder capabilities
  cofounder mcp
`);
}

main().catch((error: unknown) => {
  if (error instanceof CofounderError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const PACKAGE_NAME = "cofounder-crew";
const TEMPLATES = ["default", "worktree"];

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes;
  const answers = interactive ? await askQuestions(options) : options;
  const template = answers.template ?? "default";

  await runCofounder(["init", "--template", template], { inherit: true });
  if (template === "worktree" && !(await hasGitHead())) {
    printWorktreePrerequisiteWarning();
  }

  if (answers.setupCodex) {
    await runCofounder(["setup", "codex", "--install"], { inherit: true });
    printConversationNext({ setupInstalled: true });
    return;
  }

  printConversationNext({ setupInstalled: false });
}

function printConversationNext({ setupInstalled }) {
  console.log("");
  console.log("Next:");
  if (!setupInstalled) {
    console.log(`  ${formatCofounderCommand(["start", "--setup-codex", "--yes"])}`);
  } else {
    console.log(`  ${formatCofounderCommand(["doctor"])}`);
  }
  console.log("  codex");
  console.log("");
  console.log("Then ask Codex:");
  console.log('  "Use the Cofounder team. Show me who is available."');
  console.log('  "Ask backend to inspect this repo and summarize the implementation boundaries."');
  console.log('  "Help me add or adjust a Cofounder teammate for this project."');
}

function parseArgs(args) {
  const options = {
    yes: false,
    setupCodex: false,
    template: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }
    if (arg === "--setup-codex") {
      options.setupCodex = true;
      continue;
    }
    if (arg === "--no-setup-codex") {
      options.setupCodex = false;
      continue;
    }
    if (arg === "--template") {
      options.template = requireValue(args[index + 1], "--template");
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  validateTemplate(options.template);
  return options;
}

async function askQuestions(options) {
  const reader = createInterface({ input, output });
  try {
    const templateAnswer = options.template ?? ((await reader.question(`Template (${TEMPLATES.join("/")}) [default]: `)).trim() || "default");
    validateTemplate(templateAnswer);
    const setupDefault = options.setupCodex ? "Y/n" : "y/N";
    const setupAnswer = (await reader.question(`Install Codex MCP now? (${setupDefault}): `)).trim().toLowerCase();
    return {
      template: templateAnswer,
      setupCodex: setupAnswer ? ["y", "yes"].includes(setupAnswer) : options.setupCodex
    };
  } finally {
    reader.close();
  }
}

async function runCofounder(args, options = {}) {
  const command = resolveCofounderCommand(args);
  await new Promise((resolve, reject) => {
    const child = spawn(command.bin, command.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: options.inherit ? "inherit" : "pipe"
    });
    const stderr = [];
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const output = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(output || `${command.bin} exited with code ${code ?? "unknown"}`));
    });
  });
}

function resolveCofounderCommand(args) {
  if (process.env.COFOUNDER_CLI) {
    return {
      bin: process.execPath,
      args: [process.env.COFOUNDER_CLI, ...args]
    };
  }

  return {
    bin: "npx",
    args: resolveNpxCofounderArgs(args)
  };
}

function resolveNpxCofounderArgs(args) {
  return ["-y", "--package", PACKAGE_NAME, "--", "cofounder", ...args];
}

function formatCofounderCommand(args) {
  return ["npx", ...resolveNpxCofounderArgs(args)].map(quoteShellArg).join(" ");
}

async function hasGitHead() {
  return commandSucceeds("git", ["rev-parse", "--verify", "HEAD"]);
}

async function commandSucceeds(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore"
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function printWorktreePrerequisiteWarning() {
  console.log("");
  console.log("Warning:");
  console.log("  worktree template needs a Git repository with at least one commit before delegation.");
  console.log("  Worktrees are created from HEAD, so commit the baseline delegated agents should see.");
  console.log("");
  console.log("  For a scratch test:");
  console.log("    git init");
  console.log("    git add .");
  console.log('    git commit -m "chore: initial commit"');
  console.log("");
  console.log('  Or use direct mode by setting mode = "direct" under [write] in the member settings.toml file.');
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function validateTemplate(template) {
  if (!template) {
    return;
  }
  if (!TEMPLATES.includes(template)) {
    throw new Error(`Unknown template "${template}". Available templates: ${TEMPLATES.join(", ")}`);
  }
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing ${name} value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm create cofounder@latest
  npm create cofounder@latest -- --template worktree
  npm create cofounder@latest -- --template worktree --setup-codex --yes

Options:
  --template <default|worktree>
  --setup-codex
  --no-setup-codex
  --yes, -y

Local development:
  COFOUNDER_CLI=/path/to/dist/src/cli.js node packages/create-cofounder/index.js --yes
`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
});

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CofounderError } from "./errors.js";

const execFileAsync = promisify(execFile);
export const DEFAULT_PUBLISHED_PACKAGE = "cofounder-crew";

export interface CodexSetupOptions {
  packageName?: string;
}

export function formatCodexSetup(options: CodexSetupOptions = {}): string {
  const packageName = options.packageName ?? DEFAULT_PUBLISHED_PACKAGE;
  const modulePath = fileURLToPath(import.meta.url);
  const directMcpPath = modulePath.endsWith(".ts")
    ? path.resolve(path.dirname(modulePath), "../dist/src/mcp.js")
    : fileURLToPath(new URL("./mcp.js", import.meta.url));
  return `Codex MCP setup

Preferred from npm registry:

  codex mcp add cofounder -- npx -y --package ${packageName} -- cofounder serve mcp

After npm link or global install:

  codex mcp add cofounder -- cofounder serve mcp

Direct checkout fallback after npm run build:

  codex mcp add cofounder -- node ${directMcpPath}

Then open Codex from a configured project:

  cd my-project
  codex
`;
}

export async function installCodexMcp(options: CodexSetupOptions = {}): Promise<string> {
  const packageName = options.packageName ?? DEFAULT_PUBLISHED_PACKAGE;
  const args = ["mcp", "add", "cofounder", "--", "npx", "-y", "--package", packageName, "--", "cofounder", "serve", "mcp"];
  try {
    await execFileAsync("codex", ["mcp", "remove", "cofounder"], {
      maxBuffer: 10 * 1024 * 1024
    }).catch(() => undefined);
    await execFileAsync("codex", args, {
      maxBuffer: 10 * 1024 * 1024
    });
    return `codex ${args.join(" ")}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CofounderError(`failed to install Codex MCP config: ${message}`);
  }
}

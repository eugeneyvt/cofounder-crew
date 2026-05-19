import path from "node:path";
import { access } from "node:fs/promises";

export const CONFIG_DIR = ".cofounder";
export const TEAM_FILE = "team.yaml";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findProjectRoot(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);

  while (true) {
    if (await pathExists(path.join(current, CONFIG_DIR, TEAM_FILE))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function configRoot(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR);
}

export function fromConfigRoot(projectRoot: string, relativePath: string): string {
  return path.resolve(configRoot(projectRoot), relativePath);
}

export function relativeToProject(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath);
}

import { chmod } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const executableFiles = [
  "dist/src/cli.js",
  "dist/src/mcp.js",
  "dist/src/worker.js"
];

for (const file of executableFiles) {
  const absolutePath = path.join(root, file);
  try {
    await chmod(absolutePath, 0o755);
  } catch (error) {
    if (process.platform === "win32" && error && typeof error === "object" && "code" in error) {
      const code = error.code;
      if (code === "EINVAL" || code === "ENOSYS") {
        continue;
      }
    }
    throw error;
  }
}

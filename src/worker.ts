#!/usr/bin/env node
import { CofounderError } from "./errors.js";
import { runWorkerTask } from "./runtime.js";

const taskId = process.argv[2];

if (!taskId) {
  console.error("error: missing task_id");
  process.exit(1);
}

runWorkerTask(taskId).catch((error: unknown) => {
  if (error instanceof CofounderError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

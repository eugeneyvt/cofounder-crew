#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const roots = ["src", "tests"];
const bannedComments = [
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck"
];

const files = (await Promise.all(roots.map((root) => collectTypeScriptFiles(root)))).flat();
const failures = [];

for (const file of files) {
  const sourceText = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const comment of bannedComments) {
    const offset = sourceText.indexOf(comment);
    if (offset !== -1) {
      failures.push(formatFailure(sourceFile, offset, `banned TypeScript suppression ${comment}`));
    }
  }

  visit(sourceFile, (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      failures.push(formatFailure(sourceFile, node.getStart(sourceFile), "explicit any is banned; use unknown or a concrete type"));
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`TypeScript hygiene OK (${files.length} files, no explicit any or TS suppressions).`);

async function collectTypeScriptFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function formatFailure(sourceFile, offset, message) {
  const position = sourceFile.getLineAndCharacterOfPosition(offset);
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

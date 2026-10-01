#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createPlan } from './plan.js';
import { startServer } from './server.js';

const USAGE = `tinker-companion: apply Tinker changesets to source code, after you approve each diff.

  tinker-companion [--root <project dir>] [--port <number>]
      Start the review page for a project (default: current directory, port 4317).

  tinker-companion plan <changeset.json> [--root <project dir>]
      Print the proposed edits for a changeset. Never writes.
`;

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const root = path.resolve(option(args, '--root') ?? process.cwd());
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(1);
}

if (args[0] === 'plan') {
  const file = args[1];
  if (!file || file.startsWith('--')) {
    console.error(USAGE);
    process.exit(1);
  }
  let plan;
  try {
    plan = createPlan(root, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    console.error(`Could not read ${file} as a Tinker changeset (version 1): ${error.message.split('\n')[0]}`);
    process.exit(1);
  }
  for (const element of plan.elements) {
    console.log(`\n${element.index + 1}. ${element.title}: ${element.changes.join('; ') || 'no style changes'}`);
    for (const note of element.skipped) console.log(`   note: ${note}`);
    for (const candidate of element.options) {
      const marker = candidate.id === element.defaultOption ? '*' : ' ';
      if (candidate.status === 'ready') console.log(` ${marker} ${candidate.label}\n${candidate.diff.replace(/^/gm, '     ')}`);
      else console.log(` ${marker} ${candidate.label}\n     not available: ${candidate.reason}`);
    }
  }
  console.log('\nNothing was written. Start the companion without "plan" to review and apply.');
} else {
  const port = Number(option(args, '--port') ?? 4317);
  try {
    const server = await startServer({ root, port });
    console.log(`Tinker companion for ${server.root}\n\nOpen this link to review changesets:\n  ${server.url}\n\nThe link contains this session's token. Press Ctrl+C to stop.`);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try --port <number>.` : error.message);
    process.exit(1);
  }
}

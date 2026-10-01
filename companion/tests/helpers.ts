import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../..');

/** A throwaway copy of the playground's source, so tests never touch the real fixture. */
export function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinker-companion-'));
  fs.cpSync(path.join(REPO, 'fixtures/playground-app/src'), path.join(root, 'src'), { recursive: true });
  return root;
}

/** A golden changeset exported from the real playground by the extension's e2e tests. */
export const golden = (name: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'tests/golden', `${name}.json`), 'utf8'));

export const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8');
export const write = (root: string, file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};

/** 1-based line and column of the first occurrence of `needle` in a file. */
export function positionOf(root: string, file: string, needle: string) {
  const text = read(root, file);
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`${needle} not found in ${file}`);
  const before = text.slice(0, index).split('\n');
  return { file, line: before.length, column: before.at(-1)!.length + 1 };
}

/** The added and removed lines of a unified diff, without headers or context. */
export const changedLines = (diff: string) =>
  diff.split('\n').filter((line) => /^[+-](?![+-]{2} )/.test(line));

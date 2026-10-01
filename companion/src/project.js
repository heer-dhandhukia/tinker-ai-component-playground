import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.output', '.wxt', 'coverage', '.vite', 'storybook-static']);
const MAX_FILES = 5000;

export const hashOf = (text) => createHash('sha256').update(text).digest('hex');

/**
 * File access confined to one project root. Every path that comes from a changeset goes
 * through `resolve`, which refuses anything outside the root or inside node_modules.
 */
export function createProject(rootDirectory) {
  const root = fs.realpathSync(rootDirectory);

  /** @returns {{ abs: string, rel: string } | null} */
  const resolve = (file) => {
    if (typeof file !== 'string' || file.includes('\0')) return null;
    const candidate = path.isAbsolute(file) ? file : path.join(root, file);
    let real;
    try {
      real = fs.realpathSync(candidate);
    } catch {
      return null; // does not exist
    }
    if (real !== root && !real.startsWith(root + path.sep)) return null;
    const rel = path.relative(root, real);
    if (rel.split(path.sep).some((segment) => IGNORED_DIRECTORIES.has(segment))) return null;
    if (!fs.statSync(real).isFile()) return null;
    return { abs: real, rel: rel.split(path.sep).join('/') };
  };

  /** Project files with one of the extensions, as root-relative paths. */
  const list = (extensions) => {
    const found = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (found.length >= MAX_FILES) return;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) visit(full);
        } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
          found.push(path.relative(root, full).split(path.sep).join('/'));
        }
      }
    };
    visit(root);
    return found.sort();
  };

  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  /** Atomic write: a temp file in the same directory, then rename. */
  const write = (rel, content) => {
    const resolved = resolve(rel);
    if (!resolved) throw new Error(`Refusing to write outside the project: ${rel}`);
    const temp = `${resolved.abs}.tinker-${process.pid}.tmp`;
    fs.writeFileSync(temp, content);
    fs.renameSync(temp, resolved.abs);
  };

  return { root, resolve, list, read, write };
}

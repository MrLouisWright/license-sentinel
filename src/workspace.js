import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseYaml } from './yaml.js';

const tryJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** Find the directory that holds node_modules or a lockfile (walk up from dir). */
export function findInstallRoot(dir) {
  let d = dir;
  for (;;) {
    if (existsSync(join(d, 'node_modules')) || existsSync(join(d, 'package-lock.json')) || existsSync(join(d, 'pnpm-lock.yaml')) || existsSync(join(d, 'yarn.lock'))) return d;
    const parent = join(d, '..');
    if (parent === d) return dir;
    d = parent;
  }
}

function expandWorkspacePatterns(root, patterns) {
  const out = [];
  for (const pat of patterns) {
    const normal = pat.replace(/^\.\//, '');
    if (normal.includes('*')) {
      const base = normal.replace(/\/\*.*$/, '');
      const parent = join(root, base);
      if (!existsSync(parent)) continue;
      for (const name of readdirSync(parent)) {
        const d = join(parent, name);
        try { if (statSync(d).isDirectory() && existsSync(join(d, 'package.json'))) out.push(d); } catch {}
      }
      continue;
    }
    const abs = join(root, normal);
    if (existsSync(join(abs, 'package.json'))) out.push(abs);
  }
  return out;
}

/** List workspace package directories under a monorepo root. */
export function discoverWorkspaces(root) {
  const pj = tryJson(join(root, 'package.json'));
  const found = new Map();
  const add = (dir) => {
    const rel = relative(root, dir).split(sep).join('/') || '.';
    const wPj = tryJson(join(dir, 'package.json'));
    if (!wPj?.name) return;
    found.set(rel, { dir, relativePath: rel, name: wPj.name, version: wPj.version, private: !!wPj.private });
  };
  if (pj?.workspaces) {
    const patterns = Array.isArray(pj.workspaces) ? pj.workspaces : pj.workspaces.packages || [];
    for (const d of expandWorkspacePatterns(root, patterns)) add(d);
  }
  const pnpmWs = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWs)) {
    const y = parseYaml(readFileSync(pnpmWs, 'utf8')) || {};
    for (const d of expandWorkspacePatterns(root, y.packages || [])) add(d);
  }
  if (found.size === 0 && pj?.name) add(root);
  return [...found.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

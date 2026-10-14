import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { parseYaml } from './yaml.js';
import { LICENSE_FILE_RE } from './detect.js';
import { findInstallRoot } from './workspace.js';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const tryJson = (p) => { try { return readJson(p); } catch { return null; } };

function licenseFiles(dir) {
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names.filter((x) => LICENSE_FILE_RE.test(x)).sort()) {
    const p = join(dir, n);
    try { if (statSync(p).isFile() && statSync(p).size < 512 * 1024) out.push({ file: n, text: readFileSync(p, 'utf8') }); } catch {}
  }
  return out;
}

function fromManifest(pj, extra = {}) {
  return {
    name: pj.name, version: pj.version,
    licenseField: pj.license ?? null, licensesField: pj.licenses ?? null,
    author: typeof pj.author === 'string' ? pj.author : pj.author?.name ? `${pj.author.name}${pj.author.email ? ` <${pj.author.email}>` : ''}` : undefined,
    homepage: pj.homepage, repository: typeof pj.repository === 'string' ? pj.repository : pj.repository?.url,
    description: pj.description, private: !!pj.private,
    ...extra,
  };
}

/** Classify a graph: roots { prod: [keys], dev: [keys] }, edges key -> [keys]. Sets pkg.dev / pkg.extraneous. */
function classify(pkgs, edges, roots) {
  const prod = new Set(); const dev = new Set();
  const walk = (start, set) => { const st = [...start]; while (st.length) { const k = st.pop(); if (!k || set.has(k)) continue; set.add(k); st.push(...(edges.get(k) || [])); } };
  walk(roots.prod, prod);
  walk(roots.dev, dev);
  for (const [k, p] of pkgs) {
    if (p.dev === undefined) p.dev = !prod.has(k);
    if (!prod.has(k) && !dev.has(k) && p.extraneous === undefined && (roots.prod.length || roots.dev.length)) p.extraneous = true;
    p.dependencies = [...new Set(edges.get(k) || [])];
    p._key = k;
  }
}

// ---------- node_modules ----------
/** @param {string} root project package directory (package.json for dependency roots) @param {string} [installRoot] directory containing node_modules (monorepo hoisting) */
export function fromNodeModules(root, installRoot = root) {
  const rootPj = readJson(join(root, 'package.json'));
  const pkgs = new Map(); // realpath -> pkg
  const visitPkg = (dir) => {
    let real; try { real = realpathSync(dir); } catch { return; }
    if (pkgs.has(real)) return;
    const pj = tryJson(join(real, 'package.json'));
    if (!pj || !pj.name) return;
    pkgs.set(real, fromManifest(pj, { path: relative(root, dir).split(sep).join('/'), dir: real, licenseFiles: licenseFiles(real), deps: { ...pj.dependencies, ...pj.optionalDependencies, ...pj.peerDependencies }, source: 'node_modules' }));
    walkNm(join(real, 'node_modules'));
  };
  const walkNm = (nm) => {
    let entries; try { entries = readdirSync(nm, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.pnpm') { for (const x of safeDir(join(nm, '.pnpm'))) walkNm(join(nm, '.pnpm', x, 'node_modules')); continue; }
      if (e.name.startsWith('.')) continue;
      if (e.name.startsWith('@')) { for (const s of safeDir(join(nm, e.name))) visitPkg(join(nm, e.name, s)); continue; }
      visitPkg(join(nm, e.name));
    }
  };
  walkNm(join(installRoot, 'node_modules'));
  const rootReal = realpathSync(installRoot);
  const resolveFrom = (fromDir, name) => {
    let d = fromDir;
    for (;;) {
      const cand = join(d, 'node_modules', name);
      if (existsSync(join(cand, 'package.json'))) { try { return realpathSync(cand); } catch { return null; } }
      const up = dirname(d); if (up === d) return null; d = up;
    }
  };
  const edges = new Map();
  for (const [k, p] of pkgs) edges.set(k, Object.keys(p.deps || {}).map((n) => resolveFrom(k, n)).filter((x) => x && pkgs.has(x)));
  const r = (deps) => Object.keys(deps || {}).map((n) => resolveFrom(rootReal, n)).filter(Boolean);
  if (root === installRoot) pkgs.delete(rootReal);
  classify(pkgs, edges, { prod: r({ ...rootPj.dependencies, ...rootPj.optionalDependencies }), dev: r({ ...rootPj.devDependencies, ...rootPj.peerDependencies }) });
  for (const p of pkgs.values()) delete p.deps;
  return { root: fromManifest(rootPj, { licenseFiles: licenseFiles(root) }), packages: [...pkgs.values()], source: 'node_modules', installRoot };
}
const safeDir = (d) => { try { return readdirSync(d); } catch { return []; } };

// ---------- package-lock.json / npm-shrinkwrap.json ----------
export function fromNpmLock(file, rootPj) {
  const lock = readJson(file);
  const pkgs = new Map();
  if (lock.packages) {
    for (const [path, e] of Object.entries(lock.packages)) {
      if (!path || e.link || !path.includes('node_modules/')) continue;
      const name = e.name || path.slice(path.lastIndexOf('node_modules/') + 13);
      pkgs.set(path, { name, version: e.version, lockLicense: e.license ?? null, path, resolved: e.resolved, integrity: e.integrity, dev: !!(e.dev || e.devOptional), optional: !!e.optional, licenseFiles: [], source: 'package-lock', _deps: { ...e.dependencies, ...e.optionalDependencies, ...e.peerDependencies } });
    }
  } else if (lock.dependencies) {
    const visit = (deps, prefix) => {
      for (const [name, e] of Object.entries(deps || {})) {
        const path = `${prefix}node_modules/${name}`;
        pkgs.set(path, { name, version: e.version, lockLicense: null, path, resolved: e.resolved, integrity: e.integrity, dev: !!e.dev, optional: !!e.optional, licenseFiles: [], source: 'package-lock', _deps: { ...e.requires } });
        pkgs.get(path)._key = path;
        visit(e.dependencies, `${path}/`);
      }
    };
    visit(lock.dependencies, '');
  }
  // edges via node resolution on lock paths
  const resolve = (from, n) => { let base = from; for (;;) { const c = base ? `${base}/node_modules/${n}` : `node_modules/${n}`; if (pkgs.has(c)) return c; if (!base) return null; const i = base.lastIndexOf('/node_modules/'); base = i === -1 ? '' : base.slice(0, i); } };
  for (const [k, p] of pkgs) { p._key = k; p.dependencies = Object.keys(p._deps || {}).map((n) => resolve(k, n)).filter(Boolean); delete p._deps; }
  return { root: rootPj ? fromManifest(rootPj) : { name: lock.name, version: lock.version }, packages: [...pkgs.values()], source: 'package-lock' };
}

// ---------- pnpm-lock.yaml ----------
const stripPeer = (v) => String(v).replace(/\(.*$/, '').replace(/_.*$/, '');
function splitNameVer(key) {
  let k = key.replace(/^\//, '');
  k = k.replace(/\(.*$/, '');
  const at = k.lastIndexOf('@');
  if (at > 0) return { name: k.slice(0, at), version: stripPeer(k.slice(at + 1)) };
  const sl = k.lastIndexOf('/'); // pnpm v5: /name/1.0.0
  return { name: k.slice(0, sl), version: stripPeer(k.slice(sl + 1)) };
}
export function fromPnpmLock(file, rootPj, { importer = '.' } = {}) {
  const y = parseYaml(readFileSync(file, 'utf8')) || {};
  const ver = parseFloat(y.lockfileVersion) || 0;
  const pkgs = new Map();
  const keyOf = (name, v) => { v = String(v); if (v.startsWith('link:')) return null; return ver >= 9 ? `${name}@${stripPeer(v)}` : (v.startsWith('/') ? stripPeerKey(v) : `/${name}@${stripPeer(v)}`); };
  const stripPeerKey = (k) => { const { name, version } = splitNameVer(k); return `/${name}@${version}`; };
  const norm = (k) => { const { name, version } = splitNameVer(k); return ver >= 9 ? `${name}@${version}` : `/${name}@${version}`; };
  for (const [k, e] of Object.entries(y.packages || {})) {
    const { name, version } = splitNameVer(k);
    const key = norm(k);
    const prev = pkgs.get(key);
    pkgs.set(key, { ...(prev || {}), name: e?.name || name, version: e?.version || version, lockLicense: null, resolved: e?.resolution?.tarball, integrity: e?.resolution?.integrity, dev: e?.dev === undefined ? undefined : !!e.dev, optional: !!e?.optional, licenseFiles: [], source: 'pnpm-lock', _deps: { ...(prev?._deps || {}), ...e?.dependencies, ...e?.optionalDependencies } });
  }
  for (const [k, e] of Object.entries(y.snapshots || {})) {
    const key = norm(k);
    const p = pkgs.get(key); if (p) p._deps = { ...p._deps, ...e?.dependencies, ...e?.optionalDependencies };
  }
  const edges = new Map();
  for (const [k, p] of pkgs) { edges.set(k, Object.entries(p._deps || {}).map(([n, v]) => keyOf(n, v)).filter((x) => x && pkgs.has(x))); delete p._deps; }
  const imp = y.importers?.[importer] || (importer === '.' ? y : y.importers?.['.']) || y;
  const rootKeys = (d) => Object.entries(d || {}).map(([n, v]) => keyOf(n, typeof v === 'object' && v ? v.version : v)).filter(Boolean);
  classify(pkgs, edges, { prod: [...rootKeys(imp.dependencies), ...rootKeys(imp.optionalDependencies)], dev: rootKeys(imp.devDependencies) });
  return { root: rootPj ? fromManifest(rootPj) : {}, packages: [...pkgs.values()], source: 'pnpm-lock', importer };
}

// ---------- yarn.lock (v1 and berry) ----------
function parseYarnV1(text) {
  const entries = {};
  let cur = null, sub = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    if (indent === 0) { cur = { specs: line.replace(/:$/, '').split(/,\s*/).map((s) => s.replace(/^"|"$/g, '')), dependencies: {}, optionalDependencies: {} }; for (const s of cur.specs) entries[s] = cur; sub = null; continue; }
    if (!cur) continue;
    if (indent === 2) {
      if (line.endsWith(':')) { sub = line.slice(0, -1); continue; }
      sub = null;
      const m = line.match(/^("?[^"\s]+"?)\s+(.*)$/); if (m) cur[m[1].replace(/"/g, '')] = m[2].replace(/^"|"$/g, '');
    } else if (indent >= 4 && sub && cur[sub]) {
      const m = line.match(/^("?[^"\s]+"?)\s+(.*)$/); if (m) cur[sub][m[1].replace(/"/g, '')] = m[2].replace(/^"|"$/g, '');
    }
  }
  return entries;
}
export function fromYarnLock(file, rootPj) {
  const text = readFileSync(file, 'utf8');
  const berry = /^__metadata:/m.test(text);
  let entries = {};
  if (berry) {
    const y = parseYaml(text) || {};
    for (const [k, e] of Object.entries(y)) { if (k === '__metadata' || !e || typeof e !== 'object') continue; for (const s of k.split(/,\s*/)) entries[s.trim()] = e; }
  } else entries = parseYarnV1(text);
  const lookup = (name, range) => {
    const cands = berry ? [`${name}@${range}`, `${name}@npm:${range}`] : [`${name}@${range}`];
    for (const c of cands) if (entries[c]) return entries[c];
    return null;
  };
  const objs = new Map(); // entry obj -> key
  const pkgs = new Map();
  const keyFor = (e, specKey) => {
    if (objs.has(e)) return objs.get(e);
    const name = berry ? (e.resolution ? e.resolution.slice(0, e.resolution.lastIndexOf('@')) : specKey.slice(0, specKey.lastIndexOf('@'))) : specKey.slice(0, specKey.lastIndexOf('@', specKey.length) > 0 ? specKey.lastIndexOf('@') : specKey.length);
    const key = `${name}@${e.version}`;
    objs.set(e, key);
    if (!(berry && /@workspace:|@link:|@portal:/.test(e.resolution || '')) && !pkgs.has(key)) pkgs.set(key, { name, version: String(e.version), lockLicense: null, resolved: berry ? undefined : e.resolved, integrity: berry ? e.checksum : e.integrity, licenseFiles: [], source: berry ? 'yarn-berry-lock' : 'yarn-lock', _e: e });
    return key;
  };
  for (const [s, e] of Object.entries(entries)) keyFor(e, s);
  const edges = new Map();
  for (const [k, p] of pkgs) {
    const e = p._e; delete p._e;
    edges.set(k, Object.entries({ ...e.dependencies, ...e.optionalDependencies }).map(([n, r]) => { const t = lookup(n, r); return t ? objs.get(t) : null; }).filter((x) => x && pkgs.has(x)));
  }
  const roots = (d) => Object.entries(d || {}).map(([n, r]) => { const t = lookup(n, r); return t ? objs.get(t) : null; }).filter(Boolean);
  const pj = rootPj || {};
  classify(pkgs, edges, { prod: roots({ ...pj.dependencies, ...pj.optionalDependencies }), dev: roots(pj.devDependencies) });
  return { root: rootPj ? fromManifest(rootPj) : {}, packages: [...pkgs.values()], source: berry ? 'yarn-berry-lock' : 'yarn-lock' };
}

export const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

/**
 * Collect dependencies for a project directory.
 * source: auto (node_modules if present, else lockfile) | node_modules | lockfile | <path to lockfile>
 */
export function collectProject(dir, { source = 'auto', installRoot: installRootOpt, importer } = {}) {
  const pjPath = join(dir, 'package.json');
  const rootPj = tryJson(pjPath);
  const installRoot = installRootOpt || findInstallRoot(dir);
  const hasNm = existsSync(join(installRoot, 'node_modules'));
  const lockPath = source !== 'auto' && source !== 'node_modules' && source !== 'lockfile' ? source : LOCKFILES.map((f) => join(installRoot, f)).find(existsSync);
  let result;
  if ((source === 'auto' && hasNm && rootPj) || source === 'node_modules') {
    if (!rootPj) throw new Error(`No package.json in ${dir}`);
    if (!hasNm) throw new Error(`No node_modules in ${installRoot} (run npm install, or use --source lockfile)`);
    result = fromNodeModules(dir, installRoot);
    // enrich with lockfile license/integrity when available
    if (lockPath && /package-lock|shrinkwrap/.test(lockPath)) {
      try {
        const lk = fromNpmLock(lockPath, rootPj);
        const idx = new Map(lk.packages.map((p) => [`${p.name}@${p.version}`, p]));
        for (const p of result.packages) { const l = idx.get(`${p.name}@${p.version}`); if (l) { p.lockLicense = l.lockLicense; p.resolved ??= l.resolved; p.integrity ??= l.integrity; } }
      } catch {}
    }
  } else {
    if (!lockPath || !existsSync(lockPath)) throw new Error(`No node_modules or lockfile (${LOCKFILES.join(', ')}) near ${dir}`);
    const base = lockPath.split(/[\\/]/).pop();
    const pnpmImporter = importer ?? (dir !== installRoot ? relative(installRoot, dir).split(sep).join('/') : '.');
    result = base === 'pnpm-lock.yaml' ? fromPnpmLock(lockPath, rootPj, { importer: pnpmImporter }) : base === 'yarn.lock' ? fromYarnLock(lockPath, rootPj) : fromNpmLock(lockPath, rootPj);
    result.lockfile = base;
  }
  result.root.licenseFiles ??= licenseFiles(dir);
  result.dir = dir;
  const refOf = new Map(result.packages.map((p) => [p._key, `${p.name}@${p.version}`]));
  for (const p of result.packages) { p.ref = `${p.name}@${p.version}`; p.dependencies = [...new Set((p.dependencies || []).map((k) => refOf.get(k)).filter(Boolean))]; delete p._key; }
  // Dedupe identical name@version (hoisting variants), keeping prod over dev.
  const seen = new Map();
  for (const p of result.packages) {
    const k = `${p.name}@${p.version}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...p, paths: p.path ? [p.path] : [] });
    else { prev.dev = prev.dev && p.dev; prev.dependencies = [...new Set([...prev.dependencies, ...p.dependencies])]; if (p.path) prev.paths.push(p.path); if (!prev.licenseFiles.length && p.licenseFiles.length) prev.licenseFiles = p.licenseFiles; prev.lockLicense ??= p.lockLicense; prev.licenseField ??= p.licenseField; }
  }
  result.packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)));
  return result;
}

// src/collect.js
import { readFileSync as readFileSync2, readdirSync as readdirSync2, existsSync as existsSync2, realpathSync, statSync as statSync2 } from "node:fs";
import { join as join2, dirname, relative as relative2, sep as sep2 } from "node:path";

// src/yaml.js
function unquote(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
function splitFlow(s) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function keyColon(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && i === 0) {
      q = ch;
      continue;
    }
    if (ch === ":" && (i === s.length - 1 || s[i + 1] === " ")) return i;
  }
  return -1;
}
function scalar(s) {
  s = s.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    const o = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const i = keyColon(part.trim());
      if (i > 0) o[unquote(part.trim().slice(0, i))] = scalar(part.trim().slice(i + 1));
    }
    return o;
  }
  if (s.startsWith("[") && s.endsWith("]")) return splitFlow(s.slice(1, -1)).map(scalar);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~" || s === "") return s === "" ? "" : null;
  return unquote(s);
}
function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) continue;
    const indent = raw.match(/^ */)[0].length;
    let content = raw.slice(indent);
    if (!/^["']/.test(content)) content = content.replace(/\s+#.*$/, "");
    lines.push({ indent, content });
  }
  let i = 0;
  function block(indent) {
    if (i >= lines.length) return null;
    if (lines[i].content.startsWith("- ") || lines[i].content === "-") {
      const arr = [];
      while (i < lines.length && lines[i].indent === indent && (lines[i].content.startsWith("- ") || lines[i].content === "-")) {
        const rest = lines[i].content.slice(2);
        i++;
        if (!rest.trim()) arr.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null);
        else if (keyColon(rest) > 0) {
          lines.splice(i, 0, { indent: indent + 2, content: rest });
          arr.push(block(indent + 2));
        } else arr.push(scalar(rest));
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && lines[i].indent === indent) {
      const { content } = lines[i];
      const c = keyColon(content);
      if (c === -1) {
        i++;
        continue;
      }
      const key = unquote(content.slice(0, c));
      const rest = content.slice(c + 1).trim();
      i++;
      if (rest === "" || rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
        if (i < lines.length && lines[i].indent > indent) {
          if (rest) {
            const ind = lines[i].indent;
            const buf = [];
            while (i < lines.length && lines[i].indent >= ind) buf.push(lines[i++].content);
            obj[key] = buf.join(rest.startsWith("|") ? "\n" : " ");
          } else obj[key] = block(lines[i].indent);
        } else if (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith("- ")) obj[key] = block(indent);
        else obj[key] = rest ? "" : null;
      } else obj[key] = scalar(rest);
    }
    return obj;
  }
  return lines.length ? block(lines[0].indent) : {};
}

// src/detect.js
function detectLicenseText(text) {
  if (!text) return null;
  const t = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const v = (re) => re.test(t);
  if (v(/GNU AFFERO GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? "AGPL-3.0-or-later" : "AGPL-1.0-or-later";
  if (v(/GNU LESSER GENERAL PUBLIC LICENSE/i) || v(/GNU LIBRARY GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? "LGPL-3.0-or-later" : v(/Version 2\.1/i) ? "LGPL-2.1-or-later" : "LGPL-2.0-or-later";
  if (v(/GNU GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? "GPL-3.0-or-later" : v(/Version 2/i) ? "GPL-2.0-or-later" : "GPL-1.0-or-later";
  if (v(/Server Side Public License/i)) return "SSPL-1.0";
  if (v(/Mozilla Public License,? Version 2\.0/i)) return "MPL-2.0";
  if (v(/Eclipse Public License - v 2\.0/i)) return "EPL-2.0";
  if (v(/Eclipse Public License - v 1\.0/i)) return "EPL-1.0";
  if (v(/Apache License/i) && v(/Version 2\.0/i)) return "Apache-2.0";
  if (v(/Business Source License/i)) return "BUSL-1.1";
  if (v(/This is free and unencumbered software released into the public domain/i)) return "Unlicense";
  if (v(/CC0 1\.0 Universal/i)) return "CC0-1.0";
  if (v(/Blue ?Oak Model License/i)) return "BlueOak-1.0.0";
  if (v(/Boost Software License/i)) return "BSL-1.0";
  if (v(/DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i)) return "WTFPL";
  if (v(/Attribution 4\.0 International/i) && !v(/NonCommercial|ShareAlike|NoDerivatives/i)) return "CC-BY-4.0";
  if (v(/Permission is hereby granted, free of charge, to any person obtaining a copy/i)) {
    return v(/The above copyright notice and this permission notice shall be included/i) ? "MIT" : "MIT-0";
  }
  if (v(/Permission to use, copy, modify,? and(\/or)? distribute this software for any purpose with or without fee is hereby granted/i)) {
    return v(/provided that the above copyright notice and this permission notice appear in all copies/i) ? "ISC" : "0BSD";
  }
  if (v(/Redistribution and use in source and binary forms, with or without modification, are permitted/i)) {
    if (v(/advertising materials/i)) return "BSD-4-Clause";
    if (v(/Neither the name|The name of the author may not|names of (its|the) contributors may not/i)) return "BSD-3-Clause";
    return "BSD-2-Clause";
  }
  if (v(/This software is provided ['‘]as-is['’], without any express or implied warranty/i) && v(/altered source versions must be plainly marked/i)) return "Zlib";
  if (v(/PYTHON SOFTWARE FOUNDATION LICENSE/i)) return "Python-2.0";
  if (v(/SIL OPEN FONT LICENSE/i)) return "OFL-1.1";
  if (v(/^\s*(The )?MIT License\s*$/im)) return "MIT";
  if (v(/^\s*ISC License\s*$/im)) return "ISC";
  return null;
}
function copyrightLines(text) {
  if (!text) return [];
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(copyright\b|\(c\)|©)/i.test(l) && !/copyright (notice|holders?|owner)/i.test(l) && l.length < 200))].slice(0, 5);
}
var LICENSE_FILE_RE = /^(un)?licen[cs]e([-._].*)?$|^copying([-._].*)?$|^notice([-._].*)?$/i;

// src/workspace.js
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
var tryJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
function findInstallRoot(dir) {
  let d = dir;
  for (; ; ) {
    if (existsSync(join(d, "node_modules")) || existsSync(join(d, "package-lock.json")) || existsSync(join(d, "pnpm-lock.yaml")) || existsSync(join(d, "yarn.lock"))) return d;
    const parent = join(d, "..");
    if (parent === d) return dir;
    d = parent;
  }
}
function expandWorkspacePatterns(root, patterns) {
  const out = [];
  for (const pat of patterns) {
    const normal = pat.replace(/^\.\//, "");
    if (normal.includes("*")) {
      const base = normal.replace(/\/\*.*$/, "");
      const parent = join(root, base);
      if (!existsSync(parent)) continue;
      for (const name of readdirSync(parent)) {
        const d = join(parent, name);
        try {
          if (statSync(d).isDirectory() && existsSync(join(d, "package.json"))) out.push(d);
        } catch {
        }
      }
      continue;
    }
    const abs = join(root, normal);
    if (existsSync(join(abs, "package.json"))) out.push(abs);
  }
  return out;
}
function discoverWorkspaces(root) {
  const pj = tryJson(join(root, "package.json"));
  const found = /* @__PURE__ */ new Map();
  const add = (dir) => {
    const rel = relative(root, dir).split(sep).join("/") || ".";
    const wPj = tryJson(join(dir, "package.json"));
    if (!wPj?.name) return;
    found.set(rel, { dir, relativePath: rel, name: wPj.name, version: wPj.version, private: !!wPj.private });
  };
  if (pj?.workspaces) {
    const patterns = Array.isArray(pj.workspaces) ? pj.workspaces : pj.workspaces.packages || [];
    for (const d of expandWorkspacePatterns(root, patterns)) add(d);
  }
  const pnpmWs = join(root, "pnpm-workspace.yaml");
  if (existsSync(pnpmWs)) {
    const y = parseYaml(readFileSync(pnpmWs, "utf8")) || {};
    for (const d of expandWorkspacePatterns(root, y.packages || [])) add(d);
  }
  if (found.size === 0 && pj?.name) add(root);
  return [...found.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// src/collect.js
var readJson = (p) => JSON.parse(readFileSync2(p, "utf8"));
var tryJson2 = (p) => {
  try {
    return readJson(p);
  } catch {
    return null;
  }
};
function licenseFiles(dir) {
  let names = [];
  try {
    names = readdirSync2(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names.filter((x) => LICENSE_FILE_RE.test(x)).sort()) {
    const p = join2(dir, n);
    try {
      if (statSync2(p).isFile() && statSync2(p).size < 512 * 1024) out.push({ file: n, text: readFileSync2(p, "utf8") });
    } catch {
    }
  }
  return out;
}
function fromManifest(pj, extra = {}) {
  return {
    name: pj.name,
    version: pj.version,
    licenseField: pj.license ?? null,
    licensesField: pj.licenses ?? null,
    author: typeof pj.author === "string" ? pj.author : pj.author?.name ? `${pj.author.name}${pj.author.email ? ` <${pj.author.email}>` : ""}` : void 0,
    homepage: pj.homepage,
    repository: typeof pj.repository === "string" ? pj.repository : pj.repository?.url,
    description: pj.description,
    private: !!pj.private,
    ...extra
  };
}
function classify(pkgs, edges, roots) {
  const prod = /* @__PURE__ */ new Set();
  const dev = /* @__PURE__ */ new Set();
  const walk = (start, set) => {
    const st = [...start];
    while (st.length) {
      const k = st.pop();
      if (!k || set.has(k)) continue;
      set.add(k);
      st.push(...edges.get(k) || []);
    }
  };
  walk(roots.prod, prod);
  walk(roots.dev, dev);
  for (const [k, p] of pkgs) {
    if (p.dev === void 0) p.dev = !prod.has(k);
    if (!prod.has(k) && !dev.has(k) && p.extraneous === void 0 && (roots.prod.length || roots.dev.length)) p.extraneous = true;
    p.dependencies = [...new Set(edges.get(k) || [])];
    p._key = k;
  }
}
function fromNodeModules(root, installRoot = root) {
  const rootPj = readJson(join2(root, "package.json"));
  const pkgs = /* @__PURE__ */ new Map();
  const visitPkg = (dir) => {
    let real;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (pkgs.has(real)) return;
    const pj = tryJson2(join2(real, "package.json"));
    if (!pj || !pj.name) return;
    pkgs.set(real, fromManifest(pj, { path: relative2(root, dir).split(sep2).join("/"), dir: real, licenseFiles: licenseFiles(real), deps: { ...pj.dependencies, ...pj.optionalDependencies, ...pj.peerDependencies }, source: "node_modules" }));
    walkNm(join2(real, "node_modules"));
  };
  const walkNm = (nm) => {
    let entries;
    try {
      entries = readdirSync2(nm, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".pnpm") {
        for (const x of safeDir(join2(nm, ".pnpm"))) walkNm(join2(nm, ".pnpm", x, "node_modules"));
        continue;
      }
      if (e.name.startsWith(".")) continue;
      if (e.name.startsWith("@")) {
        for (const s of safeDir(join2(nm, e.name))) visitPkg(join2(nm, e.name, s));
        continue;
      }
      visitPkg(join2(nm, e.name));
    }
  };
  walkNm(join2(installRoot, "node_modules"));
  const rootReal = realpathSync(installRoot);
  const resolveFrom = (fromDir, name) => {
    let d = fromDir;
    for (; ; ) {
      const cand = join2(d, "node_modules", name);
      if (existsSync2(join2(cand, "package.json"))) {
        try {
          return realpathSync(cand);
        } catch {
          return null;
        }
      }
      const up = dirname(d);
      if (up === d) return null;
      d = up;
    }
  };
  const edges = /* @__PURE__ */ new Map();
  for (const [k, p] of pkgs) edges.set(k, Object.keys(p.deps || {}).map((n) => resolveFrom(k, n)).filter((x) => x && pkgs.has(x)));
  const r = (deps) => Object.keys(deps || {}).map((n) => resolveFrom(rootReal, n)).filter(Boolean);
  if (root === installRoot) pkgs.delete(rootReal);
  classify(pkgs, edges, { prod: r({ ...rootPj.dependencies, ...rootPj.optionalDependencies }), dev: r({ ...rootPj.devDependencies, ...rootPj.peerDependencies }) });
  for (const p of pkgs.values()) delete p.deps;
  return { root: fromManifest(rootPj, { licenseFiles: licenseFiles(root) }), packages: [...pkgs.values()], source: "node_modules", installRoot };
}
var safeDir = (d) => {
  try {
    return readdirSync2(d);
  } catch {
    return [];
  }
};
function fromNpmLock(file, rootPj) {
  const lock = readJson(file);
  const pkgs = /* @__PURE__ */ new Map();
  if (lock.packages) {
    for (const [path, e] of Object.entries(lock.packages)) {
      if (!path || e.link || !path.includes("node_modules/")) continue;
      const name = e.name || path.slice(path.lastIndexOf("node_modules/") + 13);
      pkgs.set(path, { name, version: e.version, lockLicense: e.license ?? null, path, resolved: e.resolved, integrity: e.integrity, dev: !!(e.dev || e.devOptional), optional: !!e.optional, licenseFiles: [], source: "package-lock", _deps: { ...e.dependencies, ...e.optionalDependencies, ...e.peerDependencies } });
    }
  } else if (lock.dependencies) {
    const visit = (deps, prefix) => {
      for (const [name, e] of Object.entries(deps || {})) {
        const path = `${prefix}node_modules/${name}`;
        pkgs.set(path, { name, version: e.version, lockLicense: null, path, resolved: e.resolved, integrity: e.integrity, dev: !!e.dev, optional: !!e.optional, licenseFiles: [], source: "package-lock", _deps: { ...e.requires } });
        pkgs.get(path)._key = path;
        visit(e.dependencies, `${path}/`);
      }
    };
    visit(lock.dependencies, "");
  }
  const resolve = (from, n) => {
    let base = from;
    for (; ; ) {
      const c = base ? `${base}/node_modules/${n}` : `node_modules/${n}`;
      if (pkgs.has(c)) return c;
      if (!base) return null;
      const i = base.lastIndexOf("/node_modules/");
      base = i === -1 ? "" : base.slice(0, i);
    }
  };
  for (const [k, p] of pkgs) {
    p._key = k;
    p.dependencies = Object.keys(p._deps || {}).map((n) => resolve(k, n)).filter(Boolean);
    delete p._deps;
  }
  return { root: rootPj ? fromManifest(rootPj) : { name: lock.name, version: lock.version }, packages: [...pkgs.values()], source: "package-lock" };
}
var stripPeer = (v) => String(v).replace(/\(.*$/, "").replace(/_.*$/, "");
function splitNameVer(key) {
  let k = key.replace(/^\//, "");
  k = k.replace(/\(.*$/, "");
  const at = k.lastIndexOf("@");
  if (at > 0) return { name: k.slice(0, at), version: stripPeer(k.slice(at + 1)) };
  const sl = k.lastIndexOf("/");
  return { name: k.slice(0, sl), version: stripPeer(k.slice(sl + 1)) };
}
function fromPnpmLock(file, rootPj, { importer = "." } = {}) {
  const y = parseYaml(readFileSync2(file, "utf8")) || {};
  const ver = parseFloat(y.lockfileVersion) || 0;
  const pkgs = /* @__PURE__ */ new Map();
  const keyOf = (name, v) => {
    v = String(v);
    if (v.startsWith("link:")) return null;
    return ver >= 9 ? `${name}@${stripPeer(v)}` : v.startsWith("/") ? stripPeerKey(v) : `/${name}@${stripPeer(v)}`;
  };
  const stripPeerKey = (k) => {
    const { name, version } = splitNameVer(k);
    return `/${name}@${version}`;
  };
  const norm = (k) => {
    const { name, version } = splitNameVer(k);
    return ver >= 9 ? `${name}@${version}` : `/${name}@${version}`;
  };
  for (const [k, e] of Object.entries(y.packages || {})) {
    const { name, version } = splitNameVer(k);
    const key = norm(k);
    const prev = pkgs.get(key);
    pkgs.set(key, { ...prev || {}, name: e?.name || name, version: e?.version || version, lockLicense: null, resolved: e?.resolution?.tarball, integrity: e?.resolution?.integrity, dev: e?.dev === void 0 ? void 0 : !!e.dev, optional: !!e?.optional, licenseFiles: [], source: "pnpm-lock", _deps: { ...prev?._deps || {}, ...e?.dependencies, ...e?.optionalDependencies } });
  }
  for (const [k, e] of Object.entries(y.snapshots || {})) {
    const key = norm(k);
    const p = pkgs.get(key);
    if (p) p._deps = { ...p._deps, ...e?.dependencies, ...e?.optionalDependencies };
  }
  const edges = /* @__PURE__ */ new Map();
  for (const [k, p] of pkgs) {
    edges.set(k, Object.entries(p._deps || {}).map(([n, v]) => keyOf(n, v)).filter((x) => x && pkgs.has(x)));
    delete p._deps;
  }
  const imp = y.importers?.[importer] || (importer === "." ? y : y.importers?.["."]) || y;
  const rootKeys = (d) => Object.entries(d || {}).map(([n, v]) => keyOf(n, typeof v === "object" && v ? v.version : v)).filter(Boolean);
  classify(pkgs, edges, { prod: [...rootKeys(imp.dependencies), ...rootKeys(imp.optionalDependencies)], dev: rootKeys(imp.devDependencies) });
  return { root: rootPj ? fromManifest(rootPj) : {}, packages: [...pkgs.values()], source: "pnpm-lock", importer };
}
function parseYarnV1(text) {
  const entries = {};
  let cur = null, sub = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    if (indent === 0) {
      cur = { specs: line.replace(/:$/, "").split(/,\s*/).map((s) => s.replace(/^"|"$/g, "")), dependencies: {}, optionalDependencies: {} };
      for (const s of cur.specs) entries[s] = cur;
      sub = null;
      continue;
    }
    if (!cur) continue;
    if (indent === 2) {
      if (line.endsWith(":")) {
        sub = line.slice(0, -1);
        continue;
      }
      sub = null;
      const m = line.match(/^("?[^"\s]+"?)\s+(.*)$/);
      if (m) cur[m[1].replace(/"/g, "")] = m[2].replace(/^"|"$/g, "");
    } else if (indent >= 4 && sub && cur[sub]) {
      const m = line.match(/^("?[^"\s]+"?)\s+(.*)$/);
      if (m) cur[sub][m[1].replace(/"/g, "")] = m[2].replace(/^"|"$/g, "");
    }
  }
  return entries;
}
function fromYarnLock(file, rootPj) {
  const text = readFileSync2(file, "utf8");
  const berry = /^__metadata:/m.test(text);
  let entries = {};
  if (berry) {
    const y = parseYaml(text) || {};
    for (const [k, e] of Object.entries(y)) {
      if (k === "__metadata" || !e || typeof e !== "object") continue;
      for (const s of k.split(/,\s*/)) entries[s.trim()] = e;
    }
  } else entries = parseYarnV1(text);
  const lookup = (name, range) => {
    const cands = berry ? [`${name}@${range}`, `${name}@npm:${range}`] : [`${name}@${range}`];
    for (const c of cands) if (entries[c]) return entries[c];
    return null;
  };
  const objs = /* @__PURE__ */ new Map();
  const pkgs = /* @__PURE__ */ new Map();
  const keyFor = (e, specKey) => {
    if (objs.has(e)) return objs.get(e);
    const name = berry ? e.resolution ? e.resolution.slice(0, e.resolution.lastIndexOf("@")) : specKey.slice(0, specKey.lastIndexOf("@")) : specKey.slice(0, specKey.lastIndexOf("@", specKey.length) > 0 ? specKey.lastIndexOf("@") : specKey.length);
    const key = `${name}@${e.version}`;
    objs.set(e, key);
    if (!(berry && /@workspace:|@link:|@portal:/.test(e.resolution || "")) && !pkgs.has(key)) pkgs.set(key, { name, version: String(e.version), lockLicense: null, resolved: berry ? void 0 : e.resolved, integrity: berry ? e.checksum : e.integrity, licenseFiles: [], source: berry ? "yarn-berry-lock" : "yarn-lock", _e: e });
    return key;
  };
  for (const [s, e] of Object.entries(entries)) keyFor(e, s);
  const edges = /* @__PURE__ */ new Map();
  for (const [k, p] of pkgs) {
    const e = p._e;
    delete p._e;
    edges.set(k, Object.entries({ ...e.dependencies, ...e.optionalDependencies }).map(([n, r]) => {
      const t = lookup(n, r);
      return t ? objs.get(t) : null;
    }).filter((x) => x && pkgs.has(x)));
  }
  const roots = (d) => Object.entries(d || {}).map(([n, r]) => {
    const t = lookup(n, r);
    return t ? objs.get(t) : null;
  }).filter(Boolean);
  const pj = rootPj || {};
  classify(pkgs, edges, { prod: roots({ ...pj.dependencies, ...pj.optionalDependencies }), dev: roots(pj.devDependencies) });
  return { root: rootPj ? fromManifest(rootPj) : {}, packages: [...pkgs.values()], source: berry ? "yarn-berry-lock" : "yarn-lock" };
}
var LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"];
function collectProject(dir, { source = "auto", installRoot: installRootOpt, importer } = {}) {
  const pjPath = join2(dir, "package.json");
  const rootPj = tryJson2(pjPath);
  const installRoot = installRootOpt || findInstallRoot(dir);
  const hasNm = existsSync2(join2(installRoot, "node_modules"));
  const lockPath = source !== "auto" && source !== "node_modules" && source !== "lockfile" ? source : LOCKFILES.map((f) => join2(installRoot, f)).find(existsSync2);
  let result;
  if (source === "auto" && hasNm && rootPj || source === "node_modules") {
    if (!rootPj) throw new Error(`No package.json in ${dir}`);
    if (!hasNm) throw new Error(`No node_modules in ${installRoot} (run npm install, or use --source lockfile)`);
    result = fromNodeModules(dir, installRoot);
    if (lockPath && /package-lock|shrinkwrap/.test(lockPath)) {
      try {
        const lk = fromNpmLock(lockPath, rootPj);
        const idx = new Map(lk.packages.map((p) => [`${p.name}@${p.version}`, p]));
        for (const p of result.packages) {
          const l = idx.get(`${p.name}@${p.version}`);
          if (l) {
            p.lockLicense = l.lockLicense;
            p.resolved ??= l.resolved;
            p.integrity ??= l.integrity;
          }
        }
      } catch {
      }
    }
  } else {
    if (!lockPath || !existsSync2(lockPath)) throw new Error(`No node_modules or lockfile (${LOCKFILES.join(", ")}) near ${dir}`);
    const base = lockPath.split(/[\\/]/).pop();
    const pnpmImporter = importer ?? (dir !== installRoot ? relative2(installRoot, dir).split(sep2).join("/") : ".");
    result = base === "pnpm-lock.yaml" ? fromPnpmLock(lockPath, rootPj, { importer: pnpmImporter }) : base === "yarn.lock" ? fromYarnLock(lockPath, rootPj) : fromNpmLock(lockPath, rootPj);
    result.lockfile = base;
  }
  result.root.licenseFiles ??= licenseFiles(dir);
  result.dir = dir;
  const refOf = new Map(result.packages.map((p) => [p._key, `${p.name}@${p.version}`]));
  for (const p of result.packages) {
    p.ref = `${p.name}@${p.version}`;
    p.dependencies = [...new Set((p.dependencies || []).map((k) => refOf.get(k)).filter(Boolean))];
    delete p._key;
  }
  const seen = /* @__PURE__ */ new Map();
  for (const p of result.packages) {
    const k = `${p.name}@${p.version}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...p, paths: p.path ? [p.path] : [] });
    else {
      prev.dev = prev.dev && p.dev;
      prev.dependencies = [.../* @__PURE__ */ new Set([...prev.dependencies, ...p.dependencies])];
      if (p.path) prev.paths.push(p.path);
      if (!prev.licenseFiles.length && p.licenseFiles.length) prev.licenseFiles = p.licenseFiles;
      prev.lockLicense ??= p.lockLicense;
      prev.licenseField ??= p.licenseField;
    }
  }
  result.packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)));
  return result;
}

// src/resolve.js
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";

// src/spdx.js
var CATEGORIES = ["public-domain", "permissive", "weak-copyleft", "strong-copyleft", "network-copyleft", "proprietary", "unknown"];
var catRank = (c) => {
  const i = CATEGORIES.indexOf(c);
  return i === -1 ? CATEGORIES.length : i;
};
var L = (cat, ids) => Object.fromEntries(ids.map((i) => [i.toLowerCase(), [i, cat]]));
var KNOWN = {
  ...L("public-domain", ["CC0-1.0", "Unlicense", "WTFPL", "0BSD", "MIT-0", "LicenseRef-Public-Domain", "CC-PDDC"]),
  ...L("permissive", ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "BSD-3-Clause-Clear", "BSD-4-Clause", "Apache-2.0", "Apache-1.1", "Zlib", "BSL-1.0", "Python-2.0", "PSF-2.0", "BlueOak-1.0.0", "CC-BY-3.0", "CC-BY-4.0", "X11", "MIT-CMU", "Artistic-2.0", "PostgreSQL", "NCSA", "Unicode-DFS-2016", "Unicode-3.0", "OFL-1.1", "AFL-2.1", "AFL-3.0", "W3C", "curl", "ZPL-2.1", "UPL-1.0", "JSON", "MirOS", "BSD-2-Clause-Patent"]),
  ...L("weak-copyleft", ["LGPL-2.0-only", "LGPL-2.0-or-later", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later", "MPL-1.1", "MPL-2.0", "EPL-1.0", "EPL-2.0", "CDDL-1.0", "CDDL-1.1", "CC-BY-SA-3.0", "CC-BY-SA-4.0", "EUPL-1.1", "EUPL-1.2", "MS-RL", "CPL-1.0", "OSL-3.0"]),
  ...L("strong-copyleft", ["GPL-1.0-only", "GPL-1.0-or-later", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later"]),
  ...L("network-copyleft", ["AGPL-1.0-only", "AGPL-1.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later", "SSPL-1.0", "RPL-1.5"]),
  ...L("proprietary", ["UNLICENSED", "BUSL-1.1", "Elastic-2.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC-BY-ND-4.0", "Commons-Clause", "PolyForm-Noncommercial-1.0.0"])
};
var LINKING_EXCEPTIONS = /classpath-exception|gcc-exception|llvm-exception|linking-exception|autoconf-exception|bison-exception|font-exception/i;
var ALIASES = {
  "mit license": "MIT",
  "the mit license": "MIT",
  "mit/x11": "MIT",
  "expat": "MIT",
  "mit-style": "MIT",
  "apache 2.0": "Apache-2.0",
  "apache-2": "Apache-2.0",
  "apache 2": "Apache-2.0",
  "apache2": "Apache-2.0",
  "apache license 2.0": "Apache-2.0",
  "apache license, version 2.0": "Apache-2.0",
  "apache-2.0 license": "Apache-2.0",
  "asl 2.0": "Apache-2.0",
  "bsd": "BSD-3-Clause",
  "new bsd": "BSD-3-Clause",
  "bsd-3": "BSD-3-Clause",
  "bsd 3-clause": "BSD-3-Clause",
  "simplified bsd": "BSD-2-Clause",
  "bsd-2": "BSD-2-Clause",
  "bsd 2-clause": "BSD-2-Clause",
  "freebsd": "BSD-2-Clause",
  "isc license": "ISC",
  "public domain": "LicenseRef-Public-Domain",
  "public-domain": "LicenseRef-Public-Domain",
  "unlicensed": "UNLICENSED",
  "the unlicense": "Unlicense",
  "gpl": "GPL-3.0-or-later",
  "gplv2": "GPL-2.0-only",
  "gpl v2": "GPL-2.0-only",
  "gpl-2": "GPL-2.0-only",
  "gplv3": "GPL-3.0-only",
  "gpl v3": "GPL-3.0-only",
  "gpl-3": "GPL-3.0-only",
  "gpl-2.0": "GPL-2.0-only",
  "gpl-2.0+": "GPL-2.0-or-later",
  "gpl-3.0": "GPL-3.0-only",
  "gpl-3.0+": "GPL-3.0-or-later",
  "gpl-1.0": "GPL-1.0-only",
  "gpl-1.0+": "GPL-1.0-or-later",
  "lgpl": "LGPL-3.0-or-later",
  "lgpl-2.0": "LGPL-2.0-only",
  "lgpl-2.0+": "LGPL-2.0-or-later",
  "lgpl-2.1": "LGPL-2.1-only",
  "lgpl-2.1+": "LGPL-2.1-or-later",
  "lgpl-3.0": "LGPL-3.0-only",
  "lgpl-3.0+": "LGPL-3.0-or-later",
  "lgplv3": "LGPL-3.0-only",
  "agpl": "AGPL-3.0-or-later",
  "agpl-3.0": "AGPL-3.0-only",
  "agpl-3.0+": "AGPL-3.0-or-later",
  "agplv3": "AGPL-3.0-only",
  "agpl-1.0": "AGPL-1.0-only",
  "mpl": "MPL-2.0",
  "mpl 2.0": "MPL-2.0",
  "mpl2": "MPL-2.0",
  "cc0": "CC0-1.0",
  "wtfpl": "WTFPL",
  "zlib": "Zlib",
  "boost": "BSL-1.0",
  "eclipse public license 2.0": "EPL-2.0"
};
var SpdxError = class extends Error {
};
function tokenize(s) {
  const toks = [];
  const re = /\s*(\(|\)|[^\s()]+)/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    const t = m[1];
    if (/^(and|or|with)$/i.test(t)) toks.push({ op: t.toUpperCase(), lenient: t !== t.toUpperCase() });
    else toks.push({ t });
  }
  if (re.lastIndex < s.trimEnd().length) throw new SpdxError(`Cannot tokenise "${s}"`);
  return toks;
}
function normaliseId(raw) {
  const lower = raw.toLowerCase();
  if (KNOWN[lower]) return { id: KNOWN[lower][0], known: true, changed: KNOWN[lower][0] !== raw };
  if (ALIASES[lower]) return { id: ALIASES[lower], known: true, changed: true };
  if (raw.endsWith("+")) {
    const base = raw.slice(0, -1).toLowerCase();
    const key = `${base.replace(/-only$/, "")}-or-later`;
    if (KNOWN[key]) return { id: KNOWN[key][0], known: true, changed: true };
    if (KNOWN[base]) return { id: KNOWN[base][0] + "+", known: true, changed: false };
  }
  if (/^(LicenseRef|DocumentRef)-/i.test(raw)) return { id: raw, known: false, changed: false };
  if (/^[A-Za-z0-9.+-]+$/.test(raw)) return { id: raw, known: false, changed: false };
  return { id: raw, known: false, changed: false, invalid: true };
}
function parse(expr) {
  const warnings = [];
  const s = String(expr ?? "").trim();
  if (!s) throw new SpdxError("Empty license expression");
  const whole = s.replace(/^\((.*)\)$/, "$1").trim();
  if (ALIASES[whole.toLowerCase()]) {
    warnings.push(`"${s}" is not a valid SPDX expression; read as ${ALIASES[whole.toLowerCase()]}`);
    return { ast: leaf(ALIASES[whole.toLowerCase()]), warnings };
  }
  const toks = tokenize(s);
  if (toks.some((t) => t.lenient)) warnings.push(`"${s}" uses lowercase operators; SPDX requires AND/OR/WITH`);
  if (toks.length === 1 && /[/,]/.test(toks[0].t) && !/^(LicenseRef|DocumentRef)-/i.test(toks[0].t)) {
    const parts = toks[0].t.split(/[/,]/).filter(Boolean);
    if (parts.length > 1 && !ALIASES[toks[0].t.toLowerCase()]) {
      warnings.push(`"${s}" is not valid SPDX; read as ${parts.join(" OR ")}`);
      return { ast: parts.map((p) => leaf(p, warnings)).reduce((l, r) => ({ op: "OR", left: l, right: r })), warnings };
    }
  }
  let i = 0;
  const peek = () => toks[i];
  function primary() {
    const t = toks[i++];
    if (!t) throw new SpdxError(`Unexpected end of expression in "${s}"`);
    if (t.t === "(") {
      const e = orExpr();
      if (toks[i++]?.t !== ")") throw new SpdxError(`Missing ")" in "${s}"`);
      return e;
    }
    if (t.op || t.t === ")") throw new SpdxError(`Unexpected "${t.op || t.t}" in "${s}"`);
    const node = leaf(t.t, warnings);
    if (peek()?.op === "WITH") {
      i++;
      const e = toks[i++];
      if (!e || e.op || e.t === "(" || e.t === ")") throw new SpdxError(`WITH needs an exception id in "${s}"`);
      node.exception = e.t;
    }
    return node;
  }
  function andExpr() {
    let l = primary();
    while (peek()?.op === "AND") {
      i++;
      l = { op: "AND", left: l, right: primary() };
    }
    return l;
  }
  function orExpr() {
    let l = andExpr();
    while (peek()?.op === "OR") {
      i++;
      l = { op: "OR", left: l, right: andExpr() };
    }
    return l;
  }
  const ast = orExpr();
  if (i < toks.length) throw new SpdxError(`Unexpected "${toks[i].op || toks[i].t}" in "${s}"`);
  return { ast, warnings };
}
function leaf(raw, warnings) {
  const n = normaliseId(raw);
  if (n.changed && warnings) warnings.push(`"${raw}" normalised to ${n.id}`);
  if (n.invalid) throw new SpdxError(`Invalid license id "${raw}"`);
  return { license: n.id, known: n.known };
}
function stringify(ast, top = true) {
  if (ast.license) return ast.license + (ast.exception ? ` WITH ${ast.exception}` : "");
  const side = (n) => n.op && n.op !== ast.op ? `(${stringify(n, false)})` : stringify(n, false);
  return `${side(ast.left)} ${ast.op} ${side(ast.right)}`;
}
function options(ast) {
  if (ast.license) return [[ast]];
  const l = options(ast.left), r = options(ast.right);
  if (ast.op === "OR") return [...l, ...r];
  const out = [];
  for (const a of l) for (const b of r) out.push([...a, ...b]);
  return out;
}
function category(leafNode) {
  const id = leafNode.license.replace(/\+$/, "");
  const k = KNOWN[id.toLowerCase()];
  let cat = k ? k[1] : /^LicenseRef-.*public.?domain/i.test(id) ? "public-domain" : "unknown";
  if (leafNode.exception && LINKING_EXCEPTIONS.test(leafNode.exception) && cat === "strong-copyleft") cat = "weak-copyleft";
  return cat;
}

// src/resolve.js
function resolveLicense(pkg) {
  const warnings = [];
  let declared = null;
  let source = null;
  const f = pkg.licenseField;
  if (typeof f === "string" && f.trim()) {
    declared = f.trim();
    source = "package.json license";
  } else if (f && typeof f === "object" && !Array.isArray(f) && f.type) {
    declared = String(f.type);
    source = "package.json license.type";
    warnings.push('Deprecated object form of "license"');
  } else if (Array.isArray(pkg.licensesField) && pkg.licensesField.length) {
    const ids = pkg.licensesField.map((l) => typeof l === "string" ? l : l?.type).filter(Boolean);
    if (ids.length) {
      declared = ids.length > 1 ? `(${ids.join(" OR ")})` : ids[0];
      source = "package.json licenses[]";
      warnings.push('Deprecated "licenses" array; read as ' + declared);
    }
  } else if (Array.isArray(f) && f.length) {
    const ids = f.map((l) => typeof l === "string" ? l : l?.type).filter(Boolean);
    declared = ids.length > 1 ? `(${ids.join(" OR ")})` : ids[0];
    source = "package.json license[]";
  } else if (typeof pkg.lockLicense === "string" && pkg.lockLicense) {
    declared = pkg.lockLicense;
    source = "lockfile";
  }
  const files = pkg.licenseFiles || [];
  let detected = null;
  let detectedFile = null;
  for (const lf of files) {
    const d = detectLicenseText(lf.text);
    if (d) {
      detected = d;
      detectedFile = lf.file;
      break;
    }
  }
  const see = declared && declared.match(/^SEE LICEN[CS]E IN\s+(.+)$/i);
  if (see) {
    let text = files.find((x) => x.file.toLowerCase() === see[1].trim().toLowerCase())?.text;
    if (!text && pkg.dir) {
      try {
        text = readFileSync3(join3(pkg.dir, see[1].trim()), "utf8");
      } catch {
      }
    }
    const d = detectLicenseText(text);
    if (d) return done(d, `${see[1].trim()} (text match)`, declared, d, [`"${declared}": detected ${d} from file text`]);
    return { expression: null, declared, detected, source, warnings, problem: "unknown", detail: `"${declared}" and the file text was not recognised` };
  }
  if (declared) {
    if (/^UNLICENSED$/i.test(declared)) return { expression: "UNLICENSED", ast: { license: "UNLICENSED", known: true }, declared, detected, source, warnings, problem: "unlicensed" };
    try {
      const p = parse(declared);
      warnings.push(...p.warnings);
      const expression = stringify(p.ast);
      const out = { expression, ast: p.ast, declared, detected, detectedFile, source, warnings };
      if (p.warnings.length) out.nonSpdx = true;
      return out;
    } catch (e) {
      if (!(e instanceof SpdxError)) throw e;
      if (detected) return done(detected, `${detectedFile} (text match)`, declared, detected, [`Declared "${declared}" is not valid SPDX (${e.message}); used ${detected} from ${detectedFile}`], true);
      return { expression: null, declared, detected, source, warnings: [e.message], problem: "invalid", detail: e.message };
    }
  }
  if (detected) return done(detected, `${detectedFile} (text match)`, null, detected, ["No license field in package.json; detected from file"]);
  if (files.length) return { expression: null, declared: null, detected: null, source: files[0].file, warnings, problem: "unknown", detail: `${files.map((x) => x.file).join(", ")} present but not recognised` };
  if (pkg.source !== "node_modules" && !pkg.registryChecked) return { expression: null, declared: null, detected: null, source: null, warnings, problem: "unresolved", detail: `${pkg.source} has no license data for this package` };
  return { expression: null, declared: null, detected: null, source: null, warnings, problem: "missing", detail: pkg.registryChecked ? "No license in the registry metadata" : "No license field and no LICENSE file" };
  function done(id, src, decl, det, w, nonSpdx = false) {
    const p = parse(id);
    return { expression: stringify(p.ast), ast: p.ast, declared: decl, detected: det, detectedFile, source: src, warnings: w, ...nonSpdx ? { nonSpdx } : {}, fromText: true };
  }
}
function noticeInfo(pkg) {
  const texts = (pkg.licenseFiles || []).filter((f) => !/^notice/i.test(f.file));
  const notices = (pkg.licenseFiles || []).filter((f) => /^notice/i.test(f.file));
  return { copyright: [...new Set(texts.flatMap((f) => copyrightLines(f.text)))], licenseText: texts[0]?.text, noticeText: notices[0]?.text };
}

// src/policy.js
var SEVERITIES = ["critical", "high", "medium", "low", "info"];
var sevRank = (s) => {
  const i = SEVERITIES.indexOf(s);
  return i === -1 ? 99 : i;
};
var RULES = {
  "denied-license": { severity: "high", title: "License is on the deny list" },
  "not-allowed": { severity: "high", title: "License is not on the allow list / preset" },
  "incompatible-license": { severity: "high", title: "License category conflicts with the project license" },
  "unlicensed": { severity: "high", title: "Package is UNLICENSED (proprietary, no rights granted)" },
  "missing-license": { severity: "medium", title: "No license information" },
  "unresolved-license": { severity: "medium", title: "License not available from the lockfile" },
  "unknown-license": { severity: "medium", title: "License could not be identified" },
  "unclassified-license": { severity: "low", title: "License id not in the category table" },
  "invalid-spdx": { severity: "low", title: "License field is not a valid SPDX expression" },
  "license-mismatch": { severity: "low", title: "Declared license differs from the LICENSE file" },
  "exception-expired": { severity: "medium", title: "Policy exception has expired" },
  "exception-unused": { severity: "info", title: "Policy exception matched nothing" }
};
var PRESETS = {
  permissive: ["public-domain", "permissive"],
  "weak-copyleft": ["public-domain", "permissive", "weak-copyleft"],
  "strong-copyleft": ["public-domain", "permissive", "weak-copyleft", "strong-copyleft", "network-copyleft"]
};
var COMPAT = {
  "public-domain": { "weak-copyleft": "low", "strong-copyleft": "high", "network-copyleft": "critical", proprietary: "high" },
  permissive: { "weak-copyleft": "low", "strong-copyleft": "high", "network-copyleft": "critical", proprietary: "high" },
  "weak-copyleft": { "strong-copyleft": "high", "network-copyleft": "critical", proprietary: "high" },
  "strong-copyleft": { "network-copyleft": "medium", proprietary: "high" },
  "network-copyleft": { proprietary: "high" },
  proprietary: { "weak-copyleft": "low", "strong-copyleft": "high", "network-copyleft": "critical", proprietary: "medium" }
};
function globRe(p) {
  return new RegExp("^" + String(p).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
}
function entryMatches(entry, leaf2) {
  const e = String(entry).trim();
  const cat = category(leaf2);
  if (/^category:/i.test(e)) return cat === e.slice(9).toLowerCase();
  if (CATEGORIES.includes(e.toLowerCase())) return cat === e.toLowerCase();
  const full = leaf2.license + (leaf2.exception ? ` WITH ${leaf2.exception}` : "");
  if (/ WITH /i.test(e)) return globRe(e).test(full);
  return globRe(e).test(leaf2.license) || globRe(e).test(leaf2.license.replace(/\+$/, ""));
}
function normaliseList(list) {
  return (list || []).map((x) => {
    const s = String(x);
    if (s.includes("*") || /^category:/i.test(s) || CATEGORIES.includes(s.toLowerCase())) return s;
    try {
      const p = parse(s);
      return p.ast.license ? p.ast.license + (p.ast.exception ? ` WITH ${p.ast.exception}` : "") : s;
    } catch {
      return s;
    }
  });
}
function projectCategory(root, config) {
  let lic = config.projectLicense ?? (typeof root?.licenseField === "string" ? root.licenseField : root?.licenseField?.type) ?? root?.license;
  if (!lic && root?.licenseFiles?.length) lic = root.licenseFiles.map((f) => detectLicenseText(f.text)).find(Boolean);
  if (!lic) return { license: null, category: null };
  if (/^UNLICENSED$/i.test(lic)) return { license: "UNLICENSED", category: "proprietary" };
  try {
    const { ast } = parse(lic);
    const opts = options(ast);
    const cats = opts.map((o) => o.reduce((m, l) => catRank(category(l)) > catRank(m) ? category(l) : m, "public-domain"));
    const best = cats.sort((a, b) => catRank(a) - catRank(b))[0];
    return { license: lic, category: best === "unknown" ? null : best };
  } catch (e) {
    if (e instanceof SpdxError) return { license: lic, category: null };
    throw e;
  }
}
function evaluate(pkg, lic, policy) {
  const findings = [];
  const add = (rule, message, fix, sev) => findings.push({ rule, severity: sev || RULES[rule].severity, package: pkg.name, version: pkg.version, license: lic.expression ?? lic.declared ?? null, dev: !!pkg.dev, message, fix });
  const id = `${pkg.name}@${pkg.version}`;
  if (lic.problem === "unlicensed") {
    add("unlicensed", `${id} is UNLICENSED: no rights are granted to use, copy or distribute it`, "Remove it, obtain a commercial license and record it as an exception, or ask the author to publish under an open-source license.");
    return { chosen: "UNLICENSED", category: "proprietary", findings };
  }
  if (lic.problem === "missing") {
    add("missing-license", `${id} has no license: ${lic.detail}`, 'Without a license you have no right to redistribute it. Check the upstream repository; if it is licensed, add an exception with the confirmed license ({"package": "' + pkg.name + '", "license": "MIT", "reason": "\u2026"}), otherwise replace it.');
    return { chosen: null, category: "unknown", findings };
  }
  if (lic.problem === "unresolved") {
    add("unresolved-license", `${id}: license unknown (${lic.detail})`, "Run against an installed node_modules, or add --registry to look licenses up on the npm registry.");
    return { chosen: null, category: "unknown", findings };
  }
  if (lic.problem === "unknown" || lic.problem === "invalid") {
    add("unknown-license", `${id}: license could not be identified (${lic.detail})`, 'Review the license text manually. Record the result as an exception with "license" set to the SPDX id, or replace the package.');
    if (lic.problem === "invalid") add("invalid-spdx", `${id} declares "${lic.declared}", which is not a valid SPDX expression`, "Ask upstream to use an SPDX identifier (https://spdx.org/licenses/).");
    return { chosen: null, category: "unknown", findings };
  }
  if (lic.nonSpdx) add("invalid-spdx", `${id} declares "${lic.declared}" (${lic.warnings.join("; ")})`, `Treated as ${lic.expression}. Ask upstream to use a valid SPDX expression.`);
  if (lic.declared && lic.detected && !lic.fromText) {
    const declaredIds = options(lic.ast).flat().map((l) => l.license.replace(/-(only|or-later)$/, ""));
    const det = lic.detected.replace(/-(only|or-later)$/, "");
    if (!declaredIds.includes(det) && !(det === "MIT-0" && declaredIds.includes("MIT"))) add("license-mismatch", `${id} declares ${lic.expression} but ${lic.detectedFile} looks like ${lic.detected}`, "Check which license really applies; the LICENSE file normally wins legally. Record an exception once confirmed.");
  }
  const opts = options(lic.ast).map((leaves) => {
    const denied = leaves.filter((l) => policy.deny.some((d) => entryMatches(d, l)));
    const allowed = policy.allowActive ? leaves.every((l) => policy.allow.some((a) => entryMatches(a, l))) : true;
    const cat = leaves.reduce((m, l) => catRank(category(l)) > catRank(m) ? category(l) : m, "public-domain");
    return { leaves, denied, allowed, cat, text: leaves.map((l) => l.license + (l.exception ? ` WITH ${l.exception}` : "")).join(" AND ") };
  });
  const score = (o) => (o.denied.length ? 1e3 : 0) + (o.allowed ? 0 : 100) + catRank(o.cat);
  const best = [...opts].sort((a, b) => score(a) - score(b))[0];
  const choice = opts.length > 1 ? ` (best option of "${lic.expression}")` : "";
  if (best.denied.length) {
    add("denied-license", `${id} is licensed ${best.text}${choice}; ${best.denied.map((l) => l.license).join(", ")} is denied by policy`, opts.length > 1 ? "Every option in the OR expression includes a denied license. Replace the package or add a time-boxed exception with a reason." : "Replace the package with a compatible alternative, or add a time-boxed exception with a reason.");
  } else if (!best.allowed) {
    add("not-allowed", `${id} is licensed ${best.text}${choice}, which is not on the allow list${policy.preset ? ` (preset: ${policy.preset})` : ""}`, `Review the license. If acceptable, add it to "allow" (e.g. "${best.leaves.find((l) => !policy.allow.some((a) => entryMatches(a, l)))?.license}") or add a per-package exception.`);
  }
  for (const l of best.leaves) {
    if (category(l) === "unknown" && !l.license.startsWith("LicenseRef-")) add("unclassified-license", `${id} uses ${l.license}, which cannot be categorised automatically`, 'Review the license and add it to "allow" or "deny" explicitly.');
    else if (category(l) === "unknown") add("unknown-license", `${id} uses custom license ${l.license}`, "Review the license text and record an exception with the outcome.");
  }
  if (policy.project.category && !best.denied.length) {
    const sev = COMPAT[policy.project.category]?.[best.cat];
    if (sev) {
      const capped = pkg.dev && sevRank(sev) < sevRank("low") ? "low" : sev;
      add(
        "incompatible-license",
        `${id} is ${best.text} (${best.cat}) but the project is ${policy.project.license} (${policy.project.category})${pkg.dev ? "; dev-only, so it is not normally distributed" : ""}`,
        best.cat === "network-copyleft" ? "Network copyleft (AGPL/SSPL) can require you to publish your source to users of a network service. Replace the package or relicense deliberately." : best.cat === "strong-copyleft" ? `Distributing ${best.text} code with a ${policy.project.category} project makes the combined work subject to the GPL. Replace it, keep it out of what you ship, or relicense.` : best.cat === "weak-copyleft" ? "Weak copyleft is usually fine for unmodified dependencies; modifications to the library itself must be shared. Confirm you ship it unmodified." : "A proprietary/non-commercial license needs a separate agreement before redistribution.",
        capped
      );
    }
  }
  return { chosen: best.text, category: best.cat, findings };
}
function buildPolicy(config, project) {
  const allow = normaliseList([...config.preset ? PRESETS[config.preset] || [] : [], ...config.allow || []]);
  return { allow, deny: normaliseList(config.deny || []), allowActive: allow.length > 0, preset: config.preset, project };
}
function semverMatch(range, version) {
  if (!range || range === "*") return true;
  return range.split("||").some((r) => {
    r = r.trim();
    if (r.endsWith(".x") || r.endsWith(".*")) return String(version).startsWith(r.slice(0, -1));
    if (r.startsWith("^")) return String(version).split(".")[0] === r.slice(1).split(".")[0];
    return r === version;
  });
}
function matchException(ex, pkg) {
  const spec = String(ex.package || "");
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1) : ex.version || "*";
  return globRe(name).test(pkg.name) && semverMatch(range, pkg.version);
}

// src/registry.js
async function enrichFromRegistry(collected, { registry = "https://registry.npmjs.org", concurrency = 8, timeout = 15e3, fetchImpl = globalThis.fetch, token } = {}) {
  const base = registry.replace(/\/+$/, "");
  const todo = collected.packages.filter((p) => p.licenseField == null && !p.licenseFiles?.length && !p.lockLicense && p.version);
  const errors = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++];
      const url = `${base}/${p.name.startsWith("@") ? "@" + encodeURIComponent(p.name.slice(1)) : encodeURIComponent(p.name)}/${encodeURIComponent(p.version)}`;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetchImpl(url, { headers: { accept: "application/json", ...token ? { authorization: `Bearer ${token}` } : {} }, signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) {
          errors.push({ package: `${p.name}@${p.version}`, error: `HTTP ${res.status}` });
          continue;
        }
        const m = await res.json();
        p.licenseField = m.license ?? null;
        p.licensesField = m.licenses ?? null;
        p.homepage ??= m.homepage;
        p.description ??= m.description;
        p.repository ??= typeof m.repository === "string" ? m.repository : m.repository?.url;
        p.author ??= typeof m.author === "string" ? m.author : m.author?.name;
        p.registryChecked = true;
      } catch (e) {
        errors.push({ package: `${p.name}@${p.version}`, error: e.name === "AbortError" ? "timeout" : e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { fetched: todo.length - errors.length, errors };
}

// src/report.js
var C = { critical: "\x1B[35;1m", high: "\x1B[31;1m", medium: "\x1B[33m", low: "\x1B[36m", info: "\x1B[2m", dim: "\x1B[2m", bold: "\x1B[1m", reset: "\x1B[0m", red: "\x1B[31m", green: "\x1B[32m" };
var summary = (counts) => SEVERITIES.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(", ") || "no findings";
var failing = (r, failOn) => failOn && failOn !== "none" && r.findings.some((f) => sevRank(f.severity) <= sevRank(failOn));
function formatText(r, { color = false, failOn, verbose = false } = {}) {
  const c = (k, s) => color ? `${C[k]}${s}${C.reset}` : s;
  const p = r.project;
  const l = [c("bold", `license-sentinel \u2014 ${p.name || "project"}${p.version ? "@" + p.version : ""} (${p.license || "no license"}${p.category ? ", " + p.category : ""})`)];
  l.push(c("dim", `${r.summary.packages} package(s) from ${p.lockfile || p.source}: ${r.summary.prod} prod, ${r.summary.dev} dev${r.policy.preset ? ` \xB7 preset ${r.policy.preset}` : ""}`));
  l.push(c("dim", `Licenses: ${Object.entries(r.summary.byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} \xD7${v}`).join(", ") || "none"}`));
  l.push("");
  if (verbose) {
    for (const x of r.packages) l.push(`  ${`${x.name}@${x.version}`.padEnd(40)} ${(x.license || "?").padEnd(28)} ${x.category}${x.dev ? " (dev)" : ""}`);
    l.push("");
  }
  for (const f of r.findings) {
    l.push(`${c(f.severity, f.severity.toUpperCase().padEnd(8))} ${f.message}${f.dev ? c("dim", " (dev)") : ""} [${f.rule}]`);
    l.push(c("dim", `         \u21B3 fix: ${f.fix}`));
  }
  if (r.findings.length) l.push("");
  if (r.suppressed.length) l.push(c("dim", `${r.suppressed.length} finding(s) covered by exceptions`));
  l.push(summary(r.counts));
  if (failOn) l.push(failing(r, failOn) ? c("red", `\u2716 Failing (fail-on: ${failOn}).`) : c("green", `\u2714 Passing (fail-on: ${failOn}).`));
  return l.join("\n") + "\n";
}
function formatJson(r) {
  const packages = r.packages.map(({ licenseText, noticeText, ...rest }) => rest);
  return JSON.stringify({ ...r, packages }, null, 2) + "\n";
}
var LEVEL = { critical: "error", high: "error", medium: "warning", low: "note", info: "note" };
var SCORE = { critical: "9.0", high: "7.5", medium: "5.0", low: "3.0", info: "1.0" };
function formatSarif(r, { version = "0.0.0", manifest = "package.json" } = {}) {
  const ids = Object.keys(RULES);
  return JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "license-sentinel", version, informationUri: "https://github.com/MrLouisWright/license-sentinel", rules: ids.map((id) => ({ id, name: id.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase()), shortDescription: { text: RULES[id].title }, helpUri: `https://github.com/MrLouisWright/license-sentinel#${id}`, defaultConfiguration: { level: LEVEL[RULES[id].severity] }, properties: { tags: ["license", "compliance"], "security-severity": SCORE[RULES[id].severity] } })) } },
      results: r.findings.map((f) => ({ ruleId: f.rule, ruleIndex: ids.indexOf(f.rule), level: LEVEL[f.severity], message: { text: `${f.message}. Fix: ${f.fix}` }, locations: [{ physicalLocation: { artifactLocation: { uri: manifest }, region: { startLine: 1 } } }], partialFingerprints: { pkgRule: `${f.rule}:${f.package}@${f.version}` }, properties: { package: f.package, version: f.version, license: f.license, severity: f.severity } }))
    }]
  }, null, 2) + "\n";
}
var esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
function formatMarkdown(r, { failOn } = {}) {
  const l = ["## \u2696\uFE0F license-sentinel", ""];
  l.push(`**${r.project.name || "project"}** (${r.project.license || "no license"}): ${r.summary.packages} packages (${r.summary.prod} prod, ${r.summary.dev} dev), ${summary(r.counts)}.`);
  if (failOn) l.push("", failing(r, failOn) ? `\u274C Failing at \`--fail-on ${failOn}\`.` : `\u2705 Passing at \`--fail-on ${failOn}\`.`);
  if (r.findings.length) {
    l.push("", "| Severity | Package | License | Rule | Finding | Fix |", "|---|---|---|---|---|---|");
    for (const f of r.findings) l.push(`| ${f.severity} | \`${esc(f.package)}${f.version ? "@" + esc(f.version) : ""}\`${f.dev ? " (dev)" : ""} | ${esc(f.license || "?")} | \`${f.rule}\` | ${esc(f.message)} | ${esc(f.fix)} |`);
  }
  l.push("", "<details><summary>License breakdown</summary>", "", "| License | Packages |", "|---|---|");
  for (const [k, v] of Object.entries(r.summary.byLicense).sort((a, b) => b[1] - a[1])) l.push(`| ${esc(k)} | ${v} |`);
  l.push("", "</details>");
  if (r.suppressed.length) l.push("", `_${r.suppressed.length} finding(s) covered by exceptions._`);
  return l.join("\n") + "\n";
}

// src/templates.js
var escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var escCsv = (s) => {
  const t = String(s ?? "");
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function formatCsv(r, { includeDev = false } = {}) {
  const rows = [["name", "version", "license", "category", "dev", "path", "homepage", "repository"]];
  for (const p of r.packages) {
    if (!includeDev && p.dev) continue;
    rows.push([p.name, p.version, p.license || "", p.category, p.dev ? "true" : "false", p.path || "", p.homepage || "", p.repository || ""]);
  }
  return rows.map((row) => row.map(escCsv).join(",")).join("\n") + "\n";
}
function formatAttributionMarkdown(r, { title, includeDev = false } = {}) {
  const pk = r.packages.filter((p) => includeDev || !p.dev);
  const l = [`# ${title || `Third-party software \u2014 ${r.project.name || "project"}`}`, "", `Generated by license-sentinel on ${r.generatedAt.slice(0, 10)}.`, "", "| Package | Version | License |", "|---|---|---|"];
  for (const p of pk.sort((a, b) => a.name.localeCompare(b.name))) l.push(`| ${p.name} | ${p.version} | ${p.license || "UNKNOWN"} |`);
  l.push("");
  return l.join("\n") + "\n";
}
function formatAttributionHtml(r, { title, includeDev = false } = {}) {
  const pk = r.packages.filter((p) => includeDev || !p.dev).sort((a, b) => a.name.localeCompare(b.name));
  const h = title || `Third-party software \u2014 ${escHtml(r.project.name || "project")}`;
  const rows = pk.map((p) => `<tr><td>${escHtml(p.name)}</td><td>${escHtml(p.version)}</td><td>${escHtml(p.license || "UNKNOWN")}</td></tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
h1{font-size:1.35rem} table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{border:1px solid #ccc;padding:.4rem .6rem;text-align:left} th{background:#f4f4f4}
footer{margin-top:2rem;font-size:.85rem;color:#555}
</style>
</head>
<body>
<h1>${h}</h1>
<p>This page lists open-source and other third-party components included in this product.</p>
<table>
<thead><tr><th>Package</th><th>Version</th><th>License</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<footer>Generated by <a href="https://github.com/MrLouisWright/license-sentinel">license-sentinel</a> on ${escHtml(r.generatedAt.slice(0, 10))}.</footer>
</body>
</html>
`;
}
var RE_BLOCK = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
var RE_VAR = /\{\{(\w+)\}\}/g;
function renderTemplate(template, r, { includeDev = false } = {}) {
  let out = template.replace(/\{\{project\.(\w+)\}\}/g, (_, k) => String(r.project[k] ?? ""));
  out = out.replace(/\{\{generatedAt\}\}/g, r.generatedAt);
  out = out.replace(/\{\{summary\.(\w+)\}\}/g, (_, k) => String(r.summary[k] ?? ""));
  out = out.replace(RE_BLOCK, (_, key, body) => {
    if (key !== "packages") return "";
    const pk = r.packages.filter((p) => includeDev || !p.dev);
    return pk.map((p) => body.replace(RE_VAR, (_2, f) => String(p[f] ?? ""))).join("");
  });
  return out.endsWith("\n") ? out : out + "\n";
}

// src/sbom.js
import { randomUUID, createHash } from "node:crypto";
var purl = (name, version) => `pkg:npm/${name.startsWith("@") ? "%40" + name.slice(1) : name}@${encodeURIComponent(version)}`;
var isSingleId = (e) => e && !/\s(AND|OR|WITH)\s/.test(e);
var known = (id) => !!KNOWN[String(id).toLowerCase()] && id !== "UNLICENSED" && !id.startsWith("LicenseRef-");
function hashes(integrity) {
  if (!integrity) return void 0;
  const out = [];
  for (const part of String(integrity).split(/\s+/)) {
    const m = part.match(/^(sha512|sha384|sha256|sha1)-(.+)$/);
    if (m) out.push({ alg: { sha512: "SHA-512", sha384: "SHA-384", sha256: "SHA-256", sha1: "SHA-1" }[m[1]], content: Buffer.from(m[2], "base64").toString("hex") });
  }
  return out.length ? out : void 0;
}
function deterministicUuid(seed) {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
var CDX_SCHEMA = "http://cyclonedx.org/schema/bom-1.6.schema.json";
function toCycloneDX(report, { toolVersion = "0.0.0", reproducible = false, specVersion = "1.6" } = {}) {
  const rootRef = purl(report.project.name || "project", report.project.version || "0.0.0");
  const lic = (e) => {
    if (!e) return void 0;
    if (isSingleId(e) && known(e)) return [{ license: { id: e } }];
    if (isSingleId(e)) return [{ license: { name: e } }];
    return [{ expression: e }];
  };
  const components = report.packages.map((p) => ({
    type: "library",
    "bom-ref": purl(p.name, p.version),
    name: p.name,
    version: p.version,
    ...p.description ? { description: p.description } : {},
    ...p.author ? { author: p.author } : {},
    scope: p.dev ? "excluded" : "required",
    ...lic(p.license) ? { licenses: lic(p.license) } : {},
    purl: purl(p.name, p.version),
    ...hashes(p.integrity) ? { hashes: hashes(p.integrity) } : {},
    ...p.resolved || p.homepage || p.repository ? { externalReferences: [p.resolved && { type: "distribution", url: p.resolved }, p.homepage && { type: "website", url: p.homepage }, p.repository && { type: "vcs", url: p.repository }].filter(Boolean) } : {},
    properties: [{ name: "license-sentinel:category", value: p.category }, ...p.licenseSource ? [{ name: "license-sentinel:license-source", value: p.licenseSource }] : [], ...p.dev ? [{ name: "cdx:npm:package:development", value: "true" }] : []]
  }));
  const refs = new Map(report.packages.map((p) => [p.ref || `${p.name}@${p.version}`, purl(p.name, p.version)]));
  const top = report.packages.filter((p) => !report.packages.some((q) => (q.dependencies || []).includes(p.ref)));
  const dependencies = [
    { ref: rootRef, dependsOn: top.map((p) => purl(p.name, p.version)) },
    ...report.packages.map((p) => ({ ref: purl(p.name, p.version), dependsOn: (p.dependencies || []).map((d) => refs.get(d)).filter(Boolean) }))
  ];
  return JSON.stringify({
    $schema: CDX_SCHEMA,
    bomFormat: "CycloneDX",
    specVersion,
    serialNumber: `urn:uuid:${reproducible ? deterministicUuid(JSON.stringify(components)) : randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: report.generatedAt,
      tools: { components: [{ type: "application", name: "license-sentinel", version: toolVersion, author: "Louis Wright" }] },
      component: { type: "application", "bom-ref": rootRef, name: report.project.name || "project", version: report.project.version || "0.0.0", ...lic(report.project.license) ? { licenses: lic(report.project.license) } : {}, purl: rootRef }
    },
    components,
    dependencies
  }, null, 2) + "\n";
}
var spdxId = (s) => "SPDXRef-" + s.replace(/[^A-Za-z0-9.-]/g, "-");
function spdxLicense(e) {
  if (!e) return "NOASSERTION";
  if (e === "UNLICENSED") return "LicenseRef-UNLICENSED";
  return e.replace(/\b([A-Za-z0-9.+-]+)\b/g, (m) => m);
}
function toSPDX(report, { toolVersion = "0.0.0", reproducible = false } = {}) {
  const rootName = report.project.name || "project";
  const rootId = spdxId(`Package-${rootName}`);
  const extracted = /* @__PURE__ */ new Map();
  const lic = (e) => {
    const l = spdxLicense(e);
    for (const m of l.matchAll(/LicenseRef-[A-Za-z0-9.-]+/g)) if (!extracted.has(m[0])) extracted.set(m[0], { licenseId: m[0], extractedText: m[0] === "LicenseRef-UNLICENSED" ? "UNLICENSED: no license granted by the author." : `${m[0]} (see package license file)`, name: m[0].slice(11) });
    return l;
  };
  const packages = [{ name: rootName, SPDXID: rootId, versionInfo: report.project.version || "NOASSERTION", downloadLocation: "NOASSERTION", filesAnalyzed: false, licenseConcluded: lic(report.project.license), licenseDeclared: lic(report.project.license), copyrightText: "NOASSERTION", primaryPackagePurpose: "APPLICATION" }];
  const ids = /* @__PURE__ */ new Map();
  for (const p of report.packages) {
    const id = spdxId(`Package-${p.name}-${p.version}`);
    ids.set(p.ref || `${p.name}@${p.version}`, id);
    packages.push({
      name: p.name,
      SPDXID: id,
      versionInfo: p.version,
      downloadLocation: p.resolved || "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: lic(p.chosen && p.chosen !== p.license ? p.chosen : p.license),
      licenseDeclared: p.declared ? lic(p.license) : "NOASSERTION",
      copyrightText: p.copyright?.length ? p.copyright.join("\n") : "NOASSERTION",
      ...p.homepage ? { homepage: p.homepage } : {},
      ...p.description ? { summary: p.description } : {},
      ...p.integrity && /^sha512-/.test(p.integrity) ? { checksums: [{ algorithm: "SHA512", checksumValue: Buffer.from(p.integrity.slice(7), "base64").toString("hex") }] } : {},
      externalRefs: [{ referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: purl(p.name, p.version) }],
      ...p.licenseSource ? { sourceInfo: `license from ${p.licenseSource}` } : {}
    });
  }
  const relationships = [{ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: rootId }];
  const isChild = new Set(report.packages.flatMap((p) => p.dependencies || []));
  for (const p of report.packages) {
    const id = ids.get(p.ref || `${p.name}@${p.version}`);
    if (!isChild.has(p.ref)) relationships.push({ spdxElementId: rootId, relationshipType: "DEPENDS_ON", relatedSpdxElement: id, ...p.dev ? { comment: "development dependency" } : {} });
    for (const d of p.dependencies || []) if (ids.has(d)) relationships.push({ spdxElementId: id, relationshipType: "DEPENDS_ON", relatedSpdxElement: ids.get(d) });
  }
  const body = { packages, relationships };
  const ns = reproducible ? deterministicUuid(JSON.stringify(body)) : randomUUID();
  return JSON.stringify({
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${rootName}-sbom`,
    documentNamespace: `https://github.com/MrLouisWright/license-sentinel/spdx/${encodeURIComponent(rootName)}-${ns}`,
    creationInfo: { created: report.generatedAt.replace(/\.\d+Z$/, "Z"), creators: [`Tool: license-sentinel-${toolVersion}`] },
    ...extracted.size ? { hasExtractedLicensingInfos: [...extracted.values()] } : {},
    ...body
  }, null, 2) + "\n";
}
function toNotices(report, { includeDev = false } = {}) {
  const pk = report.packages.filter((p) => includeDev || !p.dev);
  const out = [`THIRD-PARTY SOFTWARE NOTICES AND INFORMATION`, ``, `${report.project.name || "This project"} includes the following third-party packages.`, `Generated by license-sentinel on ${report.generatedAt.slice(0, 10)}.`, ""];
  out.push("Summary", "-------");
  for (const p of pk) out.push(`- ${p.name}@${p.version} \u2014 ${p.license || "UNKNOWN"}`);
  out.push("");
  for (const p of pk) {
    out.push("=".repeat(78), `${p.name}@${p.version}`, `License: ${p.license || "UNKNOWN"}${p.chosen && p.chosen !== p.license ? ` (used under ${p.chosen})` : ""}`);
    if (p.homepage || p.repository) out.push(`Source: ${p.homepage || p.repository}`);
    if (!p.licenseText) for (const c of p.copyright || []) out.push(c);
    out.push("");
    if (p.licenseText) out.push(p.licenseText.trim(), "");
    else out.push(`(No license text shipped with the package; see https://spdx.org/licenses/${encodeURIComponent((p.license || "").split(" ")[0])}.html)`, "");
    if (p.noticeText) out.push("NOTICE:", p.noticeText.trim(), "");
  }
  return out.join("\n") + "\n";
}

// src/index.js
var ConfigError = class extends Error {
};
function normaliseOverrides(config) {
  const overrides = config.overrides || [];
  if (!overrides.length) return config;
  const exceptions = [...config.exceptions || []];
  for (const [i, o] of overrides.entries()) {
    if (!o || typeof o !== "object" || !o.package) throw new ConfigError(`overrides[${i}] needs "package"`);
    if (!o.reason || !String(o.reason).trim()) throw new ConfigError(`overrides[${i}] (${o.package}) needs a "reason"`);
    if (!o.license) throw new ConfigError(`overrides[${i}] (${o.package}) needs "license"`);
    exceptions.push({ ...o, rules: o.rules || ["missing-license", "unknown-license", "invalid-spdx", "license-mismatch", "unresolved-license"] });
  }
  const { overrides: _o, ...rest } = config;
  return { ...rest, exceptions };
}
function validateConfig(config = {}) {
  const merged = normaliseOverrides({ ...config });
  config = merged;
  if (config.preset && !PRESETS[config.preset]) throw new ConfigError(`Unknown preset "${config.preset}" (use ${Object.keys(PRESETS).join(", ")})`);
  for (const k of ["allow", "deny", "exceptions", "ignore", "overrides"]) if (config[k] !== void 0 && !Array.isArray(config[k])) throw new ConfigError(`"${k}" must be an array`);
  for (const [i, ex] of (config.exceptions || []).entries()) {
    if (!ex || typeof ex !== "object" || !ex.package) throw new ConfigError(`exceptions[${i}] needs "package"`);
    if (!ex.reason || !String(ex.reason).trim()) throw new ConfigError(`exceptions[${i}] (${ex.package}) needs a "reason"`);
    if (ex.expires && Number.isNaN(Date.parse(ex.expires))) throw new ConfigError(`exceptions[${i}] (${ex.package}) has an invalid "expires" date`);
    if (ex.license) {
      try {
        parse(ex.license);
      } catch (e) {
        throw new ConfigError(`exceptions[${i}] (${ex.package}) license: ${e.message}`);
      }
    }
  }
  for (const [r, s] of Object.entries(config.severity || {})) {
    if (!RULES[r]) throw new ConfigError(`Unknown rule in "severity": ${r}`);
    if (s !== "off" && !SEVERITIES.includes(s)) throw new ConfigError(`Invalid severity for ${r}: ${s}`);
  }
  return config;
}
function audit(dir, config = {}) {
  const cfg = validateConfig({ ...config });
  const collected = collectProject(dir, { source: cfg.source || "auto", installRoot: cfg.installRoot, importer: cfg.importer });
  return auditCollected(collected, cfg);
}
function auditWorkspaces(rootDir, config = {}) {
  const cfg = validateConfig({ ...config });
  const workspaces = discoverWorkspaces(rootDir);
  const installRoot = findInstallRoot(rootDir);
  const reports = workspaces.map((w) => ({
    workspace: { name: w.name, version: w.version, relativePath: w.relativePath, dir: w.dir, private: w.private },
    report: auditCollected(collectProject(w.dir, { source: cfg.source || "auto", installRoot, importer: w.relativePath === "." ? "." : w.relativePath }), cfg)
  }));
  return { tool: "license-sentinel", mode: reports.length > 1 ? "monorepo" : "single", installRoot, workspaces: reports, generatedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
async function auditAsync(dir, config = {}, { fetchImpl, token } = {}) {
  const cfg = validateConfig({ ...config });
  const collected = collectProject(dir, { source: cfg.source || "auto", installRoot: cfg.installRoot, importer: cfg.importer });
  let registryErrors = [];
  if (cfg.registry) {
    const r = await enrichFromRegistry(collected, { registry: typeof cfg.registry === "string" ? cfg.registry : void 0, fetchImpl, token });
    registryErrors = r.errors;
  }
  const report = auditCollected(collected, cfg);
  report.registryErrors = registryErrors;
  return report;
}
function auditCollected(collected, config = {}) {
  const cfg = validateConfig({ ...config });
  const now = cfg.now ? new Date(cfg.now) : /* @__PURE__ */ new Date();
  const today = now.toISOString().slice(0, 10);
  const project = projectCategory(collected.root, cfg);
  const policy = buildPolicy(cfg, project);
  const ignore = cfg.ignore || [];
  const exceptions = (cfg.exceptions || []).map((e) => ({ ...e, used: false, expired: !!(e.expires && e.expires < today) }));
  const findings = [];
  const suppressed = [];
  const packages = [];
  const pkgList = collected.packages.filter((p) => (cfg.includeDev || !p.dev) && !ignore.some((g) => matchException({ package: g }, p)) && !(p.private && !cfg.includePrivate && !p.version?.match(/^\d/)));
  for (const pkg of pkgList) {
    const exs = exceptions.filter((e) => matchException(e, pkg));
    let lic = resolveLicense(pkg);
    const licEx = exs.find((e) => e.license && !e.expired);
    if (licEx) {
      const p = parse(licEx.license);
      lic = { expression: stringify(p.ast), ast: p.ast, declared: lic.declared, detected: lic.detected, source: `exception (${licEx.reason})`, warnings: [], overridden: true };
      licEx.used = true;
    }
    const ev = evaluate(pkg, lic, policy);
    for (const f of ev.findings) {
      const ex = exs.find((e) => !e.license && (!e.rules || e.rules.includes(f.rule)));
      if (ex && !ex.expired) {
        ex.used = true;
        suppressed.push({ ...f, exception: { reason: ex.reason, expires: ex.expires } });
        continue;
      }
      if (ex && ex.expired) {
        ex.used = true;
        f.message += ` (exception expired ${ex.expires})`;
      }
      findings.push(f);
    }
    for (const e of exs.filter((x) => x.expired)) {
      e.used = true;
      findings.push({ rule: "exception-expired", severity: RULES["exception-expired"].severity, package: pkg.name, version: pkg.version, license: lic.expression, dev: !!pkg.dev, message: `Exception for ${e.package} expired on ${e.expires} ("${e.reason}")`, fix: 'Re-review the package and extend "expires", or remove the dependency.' });
    }
    packages.push({ name: pkg.name, version: pkg.version, ref: pkg.ref, dev: !!pkg.dev, ...pkg.extraneous ? { extraneous: true } : {}, license: lic.expression, declared: lic.declared ?? null, detected: lic.detected ?? null, licenseSource: lic.source, chosen: ev.chosen, category: ev.category, path: pkg.paths?.[0] ?? pkg.path, resolved: pkg.resolved, integrity: pkg.integrity, author: pkg.author, homepage: pkg.homepage, repository: pkg.repository, description: pkg.description, dependencies: pkg.dependencies || [], ...noticeInfo(pkg) });
  }
  for (const e of exceptions.filter((x) => !x.used)) findings.push({ rule: "exception-unused", severity: RULES["exception-unused"].severity, package: e.package, version: "", license: null, dev: false, message: `Exception for "${e.package}" did not match any audited package`, fix: "Remove stale exceptions to keep the policy honest." });
  const sev = cfg.severity || {};
  const final = findings.filter((f) => sev[f.rule] !== "off").map((f) => SEVERITIES.includes(sev[f.rule]) ? { ...f, severity: sev[f.rule] } : f);
  final.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.package.localeCompare(b.package));
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, final.filter((f) => f.severity === s).length]));
  const byCategory = {};
  for (const p of packages) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  const byLicense = {};
  for (const p of packages) {
    const k = p.license || "(unknown)";
    byLicense[k] = (byLicense[k] || 0) + 1;
  }
  return {
    tool: "license-sentinel",
    generatedAt: now.toISOString(),
    project: { name: collected.root?.name, version: collected.root?.version, license: project.license, category: project.category, dir: collected.dir, source: collected.source, lockfile: collected.lockfile },
    policy: { preset: cfg.preset || null, allow: policy.allow, deny: policy.deny, includeDev: !!cfg.includeDev },
    summary: { packages: packages.length, prod: packages.filter((p) => !p.dev).length, dev: packages.filter((p) => p.dev).length, byCategory, byLicense },
    packages,
    findings: final,
    suppressed,
    counts
  };
}
function exceeds(report, failOn = "high") {
  if (failOn === "none") return false;
  return report.findings.some((f) => sevRank(f.severity) <= sevRank(failOn));
}
export {
  CATEGORIES,
  ConfigError,
  PRESETS,
  RULES,
  SEVERITIES,
  audit,
  auditAsync,
  auditCollected,
  auditWorkspaces,
  collectProject,
  detectLicenseText,
  discoverWorkspaces,
  enrichFromRegistry,
  entryMatches,
  exceeds,
  findInstallRoot,
  formatAttributionHtml,
  formatAttributionMarkdown,
  formatCsv,
  formatJson,
  formatMarkdown,
  formatSarif,
  formatText,
  fromNodeModules,
  fromNpmLock,
  fromPnpmLock,
  fromYarnLock,
  category as licenseCategory,
  normaliseId,
  parse as parseSpdx,
  parseYaml,
  renderTemplate,
  resolveLicense,
  options as spdxOptions,
  stringify as stringifySpdx,
  toCycloneDX,
  toNotices,
  toSPDX,
  validateConfig
};
//# sourceMappingURL=index.js.map

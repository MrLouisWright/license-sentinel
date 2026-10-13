// SPDX expression parsing, normalisation and license categories.

export const CATEGORIES = ['public-domain', 'permissive', 'weak-copyleft', 'strong-copyleft', 'network-copyleft', 'proprietary', 'unknown'];
export const catRank = (c) => { const i = CATEGORIES.indexOf(c); return i === -1 ? CATEGORIES.length : i; };

const L = (cat, ids) => Object.fromEntries(ids.map((i) => [i.toLowerCase(), [i, cat]]));
export const KNOWN = {
  ...L('public-domain', ['CC0-1.0', 'Unlicense', 'WTFPL', '0BSD', 'MIT-0', 'LicenseRef-Public-Domain', 'CC-PDDC']),
  ...L('permissive', ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-3-Clause-Clear', 'BSD-4-Clause', 'Apache-2.0', 'Apache-1.1', 'Zlib', 'BSL-1.0', 'Python-2.0', 'PSF-2.0', 'BlueOak-1.0.0', 'CC-BY-3.0', 'CC-BY-4.0', 'X11', 'MIT-CMU', 'Artistic-2.0', 'PostgreSQL', 'NCSA', 'Unicode-DFS-2016', 'Unicode-3.0', 'OFL-1.1', 'AFL-2.1', 'AFL-3.0', 'W3C', 'curl', 'ZPL-2.1', 'UPL-1.0', 'JSON', 'MirOS', 'BSD-2-Clause-Patent']),
  ...L('weak-copyleft', ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'MPL-1.1', 'MPL-2.0', 'EPL-1.0', 'EPL-2.0', 'CDDL-1.0', 'CDDL-1.1', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0', 'EUPL-1.1', 'EUPL-1.2', 'MS-RL', 'CPL-1.0', 'OSL-3.0']),
  ...L('strong-copyleft', ['GPL-1.0-only', 'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later']),
  ...L('network-copyleft', ['AGPL-1.0-only', 'AGPL-1.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'SSPL-1.0', 'RPL-1.5']),
  ...L('proprietary', ['UNLICENSED', 'BUSL-1.1', 'Elastic-2.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'Commons-Clause', 'PolyForm-Noncommercial-1.0.0']),
};
// Exceptions that weaken copyleft for linking.
const LINKING_EXCEPTIONS = /classpath-exception|gcc-exception|llvm-exception|linking-exception|autoconf-exception|bison-exception|font-exception/i;

// Common non-SPDX spellings -> SPDX id.
const ALIASES = {
  'mit license': 'MIT', 'the mit license': 'MIT', 'mit/x11': 'MIT', 'expat': 'MIT', 'mit-style': 'MIT',
  'apache 2.0': 'Apache-2.0', 'apache-2': 'Apache-2.0', 'apache 2': 'Apache-2.0', 'apache2': 'Apache-2.0', 'apache license 2.0': 'Apache-2.0', 'apache license, version 2.0': 'Apache-2.0', 'apache-2.0 license': 'Apache-2.0', 'asl 2.0': 'Apache-2.0',
  'bsd': 'BSD-3-Clause', 'new bsd': 'BSD-3-Clause', 'bsd-3': 'BSD-3-Clause', 'bsd 3-clause': 'BSD-3-Clause', 'simplified bsd': 'BSD-2-Clause', 'bsd-2': 'BSD-2-Clause', 'bsd 2-clause': 'BSD-2-Clause', 'freebsd': 'BSD-2-Clause',
  'isc license': 'ISC', 'public domain': 'LicenseRef-Public-Domain', 'public-domain': 'LicenseRef-Public-Domain', 'unlicensed': 'UNLICENSED', 'the unlicense': 'Unlicense',
  'gpl': 'GPL-3.0-or-later', 'gplv2': 'GPL-2.0-only', 'gpl v2': 'GPL-2.0-only', 'gpl-2': 'GPL-2.0-only', 'gplv3': 'GPL-3.0-only', 'gpl v3': 'GPL-3.0-only', 'gpl-3': 'GPL-3.0-only',
  'gpl-2.0': 'GPL-2.0-only', 'gpl-2.0+': 'GPL-2.0-or-later', 'gpl-3.0': 'GPL-3.0-only', 'gpl-3.0+': 'GPL-3.0-or-later', 'gpl-1.0': 'GPL-1.0-only', 'gpl-1.0+': 'GPL-1.0-or-later',
  'lgpl': 'LGPL-3.0-or-later', 'lgpl-2.0': 'LGPL-2.0-only', 'lgpl-2.0+': 'LGPL-2.0-or-later', 'lgpl-2.1': 'LGPL-2.1-only', 'lgpl-2.1+': 'LGPL-2.1-or-later', 'lgpl-3.0': 'LGPL-3.0-only', 'lgpl-3.0+': 'LGPL-3.0-or-later', 'lgplv3': 'LGPL-3.0-only',
  'agpl': 'AGPL-3.0-or-later', 'agpl-3.0': 'AGPL-3.0-only', 'agpl-3.0+': 'AGPL-3.0-or-later', 'agplv3': 'AGPL-3.0-only', 'agpl-1.0': 'AGPL-1.0-only',
  'mpl': 'MPL-2.0', 'mpl 2.0': 'MPL-2.0', 'mpl2': 'MPL-2.0', 'cc0': 'CC0-1.0', 'wtfpl': 'WTFPL', 'zlib': 'Zlib', 'boost': 'BSL-1.0', 'eclipse public license 2.0': 'EPL-2.0',
};

export class SpdxError extends Error {}

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

/** Normalise a single license id. Returns { id, known, changed }. */
export function normaliseId(raw) {
  const lower = raw.toLowerCase();
  if (KNOWN[lower]) return { id: KNOWN[lower][0], known: true, changed: KNOWN[lower][0] !== raw };
  if (ALIASES[lower]) return { id: ALIASES[lower], known: true, changed: true };
  // "-or-later" via trailing "+"
  if (raw.endsWith('+')) {
    const base = raw.slice(0, -1).toLowerCase();
    const key = `${base.replace(/-only$/, '')}-or-later`;
    if (KNOWN[key]) return { id: KNOWN[key][0], known: true, changed: true };
    if (KNOWN[base]) return { id: KNOWN[base][0] + '+', known: true, changed: false };
  }
  if (/^(LicenseRef|DocumentRef)-/i.test(raw)) return { id: raw, known: false, changed: false };
  if (/^[A-Za-z0-9.+-]+$/.test(raw)) return { id: raw, known: false, changed: false };
  return { id: raw, known: false, changed: false, invalid: true };
}

/**
 * Parse an SPDX expression into an AST:
 *   { license, exception?, known } | { op: 'AND'|'OR', left, right }
 * Lenient: lowercase operators and common aliases are accepted and reported via `warnings`.
 */
export function parse(expr) {
  const warnings = [];
  const s = String(expr ?? '').trim();
  if (!s) throw new SpdxError('Empty license expression');
  // Whole-string alias ("Apache License 2.0", "MIT License", "Public Domain")
  const whole = s.replace(/^\((.*)\)$/, '$1').trim();
  if (ALIASES[whole.toLowerCase()]) {
    warnings.push(`"${s}" is not a valid SPDX expression; read as ${ALIASES[whole.toLowerCase()]}`);
    return { ast: leaf(ALIASES[whole.toLowerCase()]), warnings };
  }
  const toks = tokenize(s);
  if (toks.some((t) => t.lenient)) warnings.push(`"${s}" uses lowercase operators; SPDX requires AND/OR/WITH`);
  // Legacy "MIT/Apache-2.0" or "MIT, Apache-2.0"
  if (toks.length === 1 && /[/,]/.test(toks[0].t) && !/^(LicenseRef|DocumentRef)-/i.test(toks[0].t)) {
    const parts = toks[0].t.split(/[/,]/).filter(Boolean);
    if (parts.length > 1 && !ALIASES[toks[0].t.toLowerCase()]) {
      warnings.push(`"${s}" is not valid SPDX; read as ${parts.join(' OR ')}`);
      return { ast: parts.map((p) => leaf(p, warnings)).reduce((l, r) => ({ op: 'OR', left: l, right: r })), warnings };
    }
  }
  let i = 0;
  const peek = () => toks[i];
  function primary() {
    const t = toks[i++];
    if (!t) throw new SpdxError(`Unexpected end of expression in "${s}"`);
    if (t.t === '(') { const e = orExpr(); if (toks[i++]?.t !== ')') throw new SpdxError(`Missing ")" in "${s}"`); return e; }
    if (t.op || t.t === ')') throw new SpdxError(`Unexpected "${t.op || t.t}" in "${s}"`);
    const node = leaf(t.t, warnings);
    if (peek()?.op === 'WITH') { i++; const e = toks[i++]; if (!e || e.op || e.t === '(' || e.t === ')') throw new SpdxError(`WITH needs an exception id in "${s}"`); node.exception = e.t; }
    return node;
  }
  function andExpr() { let l = primary(); while (peek()?.op === 'AND') { i++; l = { op: 'AND', left: l, right: primary() }; } return l; }
  function orExpr() { let l = andExpr(); while (peek()?.op === 'OR') { i++; l = { op: 'OR', left: l, right: andExpr() }; } return l; }
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

export function stringify(ast, top = true) {
  if (ast.license) return ast.license + (ast.exception ? ` WITH ${ast.exception}` : '');
  const side = (n) => (n.op && n.op !== ast.op ? `(${stringify(n, false)})` : stringify(n, false));
  return `${side(ast.left)} ${ast.op} ${side(ast.right)}`;
}

/** Disjunctive normal form: array of options, each an array of leaves that must all be accepted. */
export function options(ast) {
  if (ast.license) return [[ast]];
  const l = options(ast.left), r = options(ast.right);
  if (ast.op === 'OR') return [...l, ...r];
  const out = [];
  for (const a of l) for (const b of r) out.push([...a, ...b]);
  return out;
}

export function category(leafNode) {
  const id = leafNode.license.replace(/\+$/, '');
  const k = KNOWN[id.toLowerCase()];
  let cat = k ? k[1] : (/^LicenseRef-.*public.?domain/i.test(id) ? 'public-domain' : 'unknown');
  if (leafNode.exception && LINKING_EXCEPTIONS.test(leafNode.exception) && cat === 'strong-copyleft') cat = 'weak-copyleft';
  return cat;
}

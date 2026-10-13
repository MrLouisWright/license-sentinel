import { detectLicenseText } from './detect.js';
import { options, category, catRank, CATEGORIES, KNOWN, parse, SpdxError } from './spdx.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const sevRank = (s) => { const i = SEVERITIES.indexOf(s); return i === -1 ? 99 : i; };

export const RULES = {
  'denied-license': { severity: 'high', title: 'License is on the deny list' },
  'not-allowed': { severity: 'high', title: 'License is not on the allow list / preset' },
  'incompatible-license': { severity: 'high', title: 'License category conflicts with the project license' },
  'unlicensed': { severity: 'high', title: 'Package is UNLICENSED (proprietary, no rights granted)' },
  'missing-license': { severity: 'medium', title: 'No license information' },
  'unresolved-license': { severity: 'medium', title: 'License not available from the lockfile' },
  'unknown-license': { severity: 'medium', title: 'License could not be identified' },
  'unclassified-license': { severity: 'low', title: 'License id not in the category table' },
  'invalid-spdx': { severity: 'low', title: 'License field is not a valid SPDX expression' },
  'license-mismatch': { severity: 'low', title: 'Declared license differs from the LICENSE file' },
  'exception-expired': { severity: 'medium', title: 'Policy exception has expired' },
  'exception-unused': { severity: 'info', title: 'Policy exception matched nothing' },
};

export const PRESETS = {
  permissive: ['public-domain', 'permissive'],
  'weak-copyleft': ['public-domain', 'permissive', 'weak-copyleft'],
  'strong-copyleft': ['public-domain', 'permissive', 'weak-copyleft', 'strong-copyleft', 'network-copyleft'],
};

// What a project of a given category may consume without obligations conflicts.
// severity when dep category is used by project category (absent = fine)
const COMPAT = {
  'public-domain': { 'weak-copyleft': 'low', 'strong-copyleft': 'high', 'network-copyleft': 'critical', proprietary: 'high' },
  permissive: { 'weak-copyleft': 'low', 'strong-copyleft': 'high', 'network-copyleft': 'critical', proprietary: 'high' },
  'weak-copyleft': { 'strong-copyleft': 'high', 'network-copyleft': 'critical', proprietary: 'high' },
  'strong-copyleft': { 'network-copyleft': 'medium', proprietary: 'high' },
  'network-copyleft': { proprietary: 'high' },
  proprietary: { 'weak-copyleft': 'low', 'strong-copyleft': 'high', 'network-copyleft': 'critical', proprietary: 'medium' },
};

function globRe(p) { return new RegExp('^' + String(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); }

/** Does a policy entry (id, glob, "category:x" or a bare category) match a leaf? */
export function entryMatches(entry, leaf) {
  const e = String(entry).trim();
  const cat = category(leaf);
  if (/^category:/i.test(e)) return cat === e.slice(9).toLowerCase();
  if (CATEGORIES.includes(e.toLowerCase())) return cat === e.toLowerCase();
  const full = leaf.license + (leaf.exception ? ` WITH ${leaf.exception}` : '');
  if (/ WITH /i.test(e)) return globRe(e).test(full);
  return globRe(e).test(leaf.license) || globRe(e).test(leaf.license.replace(/\+$/, ''));
}

function normaliseList(list) {
  // accept "Apache 2.0"-style entries by normalising non-glob, non-category ids
  return (list || []).map((x) => {
    const s = String(x);
    if (s.includes('*') || /^category:/i.test(s) || CATEGORIES.includes(s.toLowerCase())) return s;
    try { const p = parse(s); return p.ast.license ? p.ast.license + (p.ast.exception ? ` WITH ${p.ast.exception}` : '') : s; } catch { return s; }
  });
}

export function projectCategory(root, config) {
  let lic = config.projectLicense ?? (typeof root?.licenseField === 'string' ? root.licenseField : root?.licenseField?.type) ?? root?.license;
  if (!lic && root?.licenseFiles?.length) lic = root.licenseFiles.map((f) => detectLicenseText(f.text)).find(Boolean);
  if (!lic) return { license: null, category: null };
  if (/^UNLICENSED$/i.test(lic)) return { license: 'UNLICENSED', category: 'proprietary' };
  try {
    const { ast } = parse(lic);
    const opts = options(ast);
    // the project is bound by its least restrictive option
    const cats = opts.map((o) => o.reduce((m, l) => (catRank(category(l)) > catRank(m) ? category(l) : m), 'public-domain'));
    const best = cats.sort((a, b) => catRank(a) - catRank(b))[0];
    return { license: lic, category: best === 'unknown' ? null : best };
  } catch (e) { if (e instanceof SpdxError) return { license: lic, category: null }; throw e; }
}

/**
 * Evaluate one resolved package against the policy.
 * Returns { chosen, category, findings[] }
 */
export function evaluate(pkg, lic, policy) {
  const findings = [];
  const add = (rule, message, fix, sev) => findings.push({ rule, severity: sev || RULES[rule].severity, package: pkg.name, version: pkg.version, license: lic.expression ?? lic.declared ?? null, dev: !!pkg.dev, message, fix });
  const id = `${pkg.name}@${pkg.version}`;
  if (lic.problem === 'unlicensed') {
    add('unlicensed', `${id} is UNLICENSED: no rights are granted to use, copy or distribute it`, 'Remove it, obtain a commercial license and record it as an exception, or ask the author to publish under an open-source license.');
    return { chosen: 'UNLICENSED', category: 'proprietary', findings };
  }
  if (lic.problem === 'missing') { add('missing-license', `${id} has no license: ${lic.detail}`, 'Without a license you have no right to redistribute it. Check the upstream repository; if it is licensed, add an exception with the confirmed license ({"package": "' + pkg.name + '", "license": "MIT", "reason": "…"}), otherwise replace it.'); return { chosen: null, category: 'unknown', findings }; }
  if (lic.problem === 'unresolved') { add('unresolved-license', `${id}: license unknown (${lic.detail})`, 'Run against an installed node_modules, or add --registry to look licenses up on the npm registry.'); return { chosen: null, category: 'unknown', findings }; }
  if (lic.problem === 'unknown' || lic.problem === 'invalid') {
    add('unknown-license', `${id}: license could not be identified (${lic.detail})`, 'Review the license text manually. Record the result as an exception with "license" set to the SPDX id, or replace the package.');
    if (lic.problem === 'invalid') add('invalid-spdx', `${id} declares "${lic.declared}", which is not a valid SPDX expression`, 'Ask upstream to use an SPDX identifier (https://spdx.org/licenses/).');
    return { chosen: null, category: 'unknown', findings };
  }
  if (lic.nonSpdx) add('invalid-spdx', `${id} declares "${lic.declared}" (${lic.warnings.join('; ')})`, `Treated as ${lic.expression}. Ask upstream to use a valid SPDX expression.`);
  if (lic.declared && lic.detected && !lic.fromText) {
    const declaredIds = options(lic.ast).flat().map((l) => l.license.replace(/-(only|or-later)$/, ''));
    const det = lic.detected.replace(/-(only|or-later)$/, '');
    if (!declaredIds.includes(det) && !(det === 'MIT-0' && declaredIds.includes('MIT'))) add('license-mismatch', `${id} declares ${lic.expression} but ${lic.detectedFile} looks like ${lic.detected}`, 'Check which license really applies; the LICENSE file normally wins legally. Record an exception once confirmed.');
  }

  const opts = options(lic.ast).map((leaves) => {
    const denied = leaves.filter((l) => policy.deny.some((d) => entryMatches(d, l)));
    const allowed = policy.allowActive ? leaves.every((l) => policy.allow.some((a) => entryMatches(a, l))) : true;
    const cat = leaves.reduce((m, l) => (catRank(category(l)) > catRank(m) ? category(l) : m), 'public-domain');
    return { leaves, denied, allowed, cat, text: leaves.map((l) => l.license + (l.exception ? ` WITH ${l.exception}` : '')).join(' AND ') };
  });
  const score = (o) => (o.denied.length ? 1000 : 0) + (o.allowed ? 0 : 100) + catRank(o.cat);
  const best = [...opts].sort((a, b) => score(a) - score(b))[0];
  const choice = opts.length > 1 ? ` (best option of "${lic.expression}")` : '';
  if (best.denied.length) {
    add('denied-license', `${id} is licensed ${best.text}${choice}; ${best.denied.map((l) => l.license).join(', ')} is denied by policy`, opts.length > 1 ? 'Every option in the OR expression includes a denied license. Replace the package or add a time-boxed exception with a reason.' : 'Replace the package with a compatible alternative, or add a time-boxed exception with a reason.');
  } else if (!best.allowed) {
    add('not-allowed', `${id} is licensed ${best.text}${choice}, which is not on the allow list${policy.preset ? ` (preset: ${policy.preset})` : ''}`, `Review the license. If acceptable, add it to "allow" (e.g. "${best.leaves.find((l) => !policy.allow.some((a) => entryMatches(a, l)))?.license}") or add a per-package exception.`);
  }
  for (const l of best.leaves) {
    if (category(l) === 'unknown' && !l.license.startsWith('LicenseRef-')) add('unclassified-license', `${id} uses ${l.license}, which cannot be categorised automatically`, 'Review the license and add it to "allow" or "deny" explicitly.');
    else if (category(l) === 'unknown') add('unknown-license', `${id} uses custom license ${l.license}`, 'Review the license text and record an exception with the outcome.');
  }
  if (policy.project.category && !best.denied.length) {
    const sev = COMPAT[policy.project.category]?.[best.cat];
    if (sev) {
      const capped = pkg.dev && sevRank(sev) < sevRank('low') ? 'low' : sev;
      add('incompatible-license', `${id} is ${best.text} (${best.cat}) but the project is ${policy.project.license} (${policy.project.category})${pkg.dev ? '; dev-only, so it is not normally distributed' : ''}`,
        best.cat === 'network-copyleft' ? 'Network copyleft (AGPL/SSPL) can require you to publish your source to users of a network service. Replace the package or relicense deliberately.'
          : best.cat === 'strong-copyleft' ? `Distributing ${best.text} code with a ${policy.project.category} project makes the combined work subject to the GPL. Replace it, keep it out of what you ship, or relicense.`
            : best.cat === 'weak-copyleft' ? 'Weak copyleft is usually fine for unmodified dependencies; modifications to the library itself must be shared. Confirm you ship it unmodified.'
              : 'A proprietary/non-commercial license needs a separate agreement before redistribution.', capped);
    }
  }
  return { chosen: best.text, category: best.cat, findings };
}

export function buildPolicy(config, project) {
  const allow = normaliseList([...(config.preset ? PRESETS[config.preset] || [] : []), ...(config.allow || [])]);
  return { allow, deny: normaliseList(config.deny || []), allowActive: allow.length > 0, preset: config.preset, project };
}

function semverMatch(range, version) {
  if (!range || range === '*') return true;
  return range.split('||').some((r) => { r = r.trim(); if (r.endsWith('.x') || r.endsWith('.*')) return String(version).startsWith(r.slice(0, -1)); if (r.startsWith('^')) return String(version).split('.')[0] === r.slice(1).split('.')[0]; return r === version; });
}

/** Exceptions: [{ package: "name" | "name@range" | glob, license?, rules?, reason, expires? }] */
export function matchException(ex, pkg) {
  const spec = String(ex.package || '');
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1) : (ex.version || '*');
  return globRe(name).test(pkg.name) && semverMatch(range, pkg.version);
}

export { KNOWN };

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify, SpdxError } from './spdx.js';
import { detectLicenseText, copyrightLines } from './detect.js';

/**
 * Work out a package's license.
 * Returns { expression, ast, source, declared, detected, warnings[], problem? }
 *   problem: 'missing' | 'unknown' | 'invalid' | 'unlicensed'
 */
export function resolveLicense(pkg) {
  const warnings = [];
  let declared = null; let source = null;
  const f = pkg.licenseField;
  if (typeof f === 'string' && f.trim()) { declared = f.trim(); source = 'package.json license'; }
  else if (f && typeof f === 'object' && !Array.isArray(f) && f.type) { declared = String(f.type); source = 'package.json license.type'; warnings.push('Deprecated object form of "license"'); }
  else if (Array.isArray(pkg.licensesField) && pkg.licensesField.length) {
    const ids = pkg.licensesField.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
    if (ids.length) { declared = ids.length > 1 ? `(${ids.join(' OR ')})` : ids[0]; source = 'package.json licenses[]'; warnings.push('Deprecated "licenses" array; read as ' + declared); }
  } else if (Array.isArray(f) && f.length) {
    const ids = f.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
    declared = ids.length > 1 ? `(${ids.join(' OR ')})` : ids[0]; source = 'package.json license[]';
  } else if (typeof pkg.lockLicense === 'string' && pkg.lockLicense) { declared = pkg.lockLicense; source = 'lockfile'; }

  // Files
  const files = pkg.licenseFiles || [];
  let detected = null; let detectedFile = null;
  for (const lf of files) { const d = detectLicenseText(lf.text); if (d) { detected = d; detectedFile = lf.file; break; } }

  // SEE LICENSE IN <file>
  const see = declared && declared.match(/^SEE LICEN[CS]E IN\s+(.+)$/i);
  if (see) {
    let text = files.find((x) => x.file.toLowerCase() === see[1].trim().toLowerCase())?.text;
    if (!text && pkg.dir) { try { text = readFileSync(join(pkg.dir, see[1].trim()), 'utf8'); } catch {} }
    const d = detectLicenseText(text);
    if (d) return done(d, `${see[1].trim()} (text match)`, declared, d, [`"${declared}": detected ${d} from file text`]);
    return { expression: null, declared, detected, source, warnings, problem: 'unknown', detail: `"${declared}" and the file text was not recognised` };
  }

  if (declared) {
    if (/^UNLICENSED$/i.test(declared)) return { expression: 'UNLICENSED', ast: { license: 'UNLICENSED', known: true }, declared, detected, source, warnings, problem: 'unlicensed' };
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
      return { expression: null, declared, detected, source, warnings: [e.message], problem: 'invalid', detail: e.message };
    }
  }
  if (detected) return done(detected, `${detectedFile} (text match)`, null, detected, ['No license field in package.json; detected from file']);
  if (files.length) return { expression: null, declared: null, detected: null, source: files[0].file, warnings, problem: 'unknown', detail: `${files.map((x) => x.file).join(', ')} present but not recognised` };
  if (pkg.source !== 'node_modules' && !pkg.registryChecked) return { expression: null, declared: null, detected: null, source: null, warnings, problem: 'unresolved', detail: `${pkg.source} has no license data for this package` };
  return { expression: null, declared: null, detected: null, source: null, warnings, problem: 'missing', detail: pkg.registryChecked ? 'No license in the registry metadata' : 'No license field and no LICENSE file' };

  function done(id, src, decl, det, w, nonSpdx = false) {
    const p = parse(id);
    return { expression: stringify(p.ast), ast: p.ast, declared: decl, detected: det, detectedFile, source: src, warnings: w, ...(nonSpdx ? { nonSpdx } : {}), fromText: true };
  }
}

export function noticeInfo(pkg) {
  const texts = (pkg.licenseFiles || []).filter((f) => !/^notice/i.test(f.file));
  const notices = (pkg.licenseFiles || []).filter((f) => /^notice/i.test(f.file));
  return { copyright: [...new Set(texts.flatMap((f) => copyrightLines(f.text)))], licenseText: texts[0]?.text, noticeText: notices[0]?.text };
}

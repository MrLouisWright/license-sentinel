import { RULES, SEVERITIES, sevRank } from './policy.js';

const C = { critical: '\x1b[35;1m', high: '\x1b[31;1m', medium: '\x1b[33m', low: '\x1b[36m', info: '\x1b[2m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m' };
const summary = (counts) => SEVERITIES.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(', ') || 'no findings';
const failing = (r, failOn) => failOn && failOn !== 'none' && r.findings.some((f) => sevRank(f.severity) <= sevRank(failOn));

export function formatText(r, { color = false, failOn, verbose = false } = {}) {
  const c = (k, s) => (color ? `${C[k]}${s}${C.reset}` : s);
  const p = r.project;
  const l = [c('bold', `license-sentinel — ${p.name || 'project'}${p.version ? '@' + p.version : ''} (${p.license || 'no license'}${p.category ? ', ' + p.category : ''})`)];
  l.push(c('dim', `${r.summary.packages} package(s) from ${p.lockfile || p.source}: ${r.summary.prod} prod, ${r.summary.dev} dev${r.policy.preset ? ` · preset ${r.policy.preset}` : ''}`));
  l.push(c('dim', `Licenses: ${Object.entries(r.summary.byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`));
  l.push('');
  if (verbose) {
    for (const x of r.packages) l.push(`  ${`${x.name}@${x.version}`.padEnd(40)} ${(x.license || '?').padEnd(28)} ${x.category}${x.dev ? ' (dev)' : ''}`);
    l.push('');
  }
  for (const f of r.findings) {
    l.push(`${c(f.severity, f.severity.toUpperCase().padEnd(8))} ${f.message}${f.dev ? c('dim', ' (dev)') : ''} [${f.rule}]`);
    l.push(c('dim', `         ↳ fix: ${f.fix}`));
  }
  if (r.findings.length) l.push('');
  if (r.suppressed.length) l.push(c('dim', `${r.suppressed.length} finding(s) covered by exceptions`));
  l.push(summary(r.counts));
  if (failOn) l.push(failing(r, failOn) ? c('red', `✖ Failing (fail-on: ${failOn}).`) : c('green', `✔ Passing (fail-on: ${failOn}).`));
  return l.join('\n') + '\n';
}

export function formatJson(r) {
  const packages = r.packages.map(({ licenseText, noticeText, ...rest }) => rest);
  return JSON.stringify({ ...r, packages }, null, 2) + '\n';
}

const LEVEL = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };
const SCORE = { critical: '9.0', high: '7.5', medium: '5.0', low: '3.0', info: '1.0' };
export function formatSarif(r, { version = '0.0.0', manifest = 'package.json' } = {}) {
  const ids = Object.keys(RULES);
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'license-sentinel', version, informationUri: 'https://github.com/MrLouisWright/license-sentinel', rules: ids.map((id) => ({ id, name: id.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase()), shortDescription: { text: RULES[id].title }, helpUri: `https://github.com/MrLouisWright/license-sentinel#${id}`, defaultConfiguration: { level: LEVEL[RULES[id].severity] }, properties: { tags: ['license', 'compliance'], 'security-severity': SCORE[RULES[id].severity] } })) } },
      results: r.findings.map((f) => ({ ruleId: f.rule, ruleIndex: ids.indexOf(f.rule), level: LEVEL[f.severity], message: { text: `${f.message}. Fix: ${f.fix}` }, locations: [{ physicalLocation: { artifactLocation: { uri: manifest }, region: { startLine: 1 } } }], partialFingerprints: { pkgRule: `${f.rule}:${f.package}@${f.version}` }, properties: { package: f.package, version: f.version, license: f.license, severity: f.severity } })),
    }],
  }, null, 2) + '\n';
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function formatMarkdown(r, { failOn } = {}) {
  const l = ['## ⚖️ license-sentinel', ''];
  l.push(`**${r.project.name || 'project'}** (${r.project.license || 'no license'}): ${r.summary.packages} packages (${r.summary.prod} prod, ${r.summary.dev} dev), ${summary(r.counts)}.`);
  if (failOn) l.push('', failing(r, failOn) ? `❌ Failing at \`--fail-on ${failOn}\`.` : `✅ Passing at \`--fail-on ${failOn}\`.`);
  if (r.findings.length) {
    l.push('', '| Severity | Package | License | Rule | Finding | Fix |', '|---|---|---|---|---|---|');
    for (const f of r.findings) l.push(`| ${f.severity} | \`${esc(f.package)}${f.version ? '@' + esc(f.version) : ''}\`${f.dev ? ' (dev)' : ''} | ${esc(f.license || '?')} | \`${f.rule}\` | ${esc(f.message)} | ${esc(f.fix)} |`);
  }
  l.push('', '<details><summary>License breakdown</summary>', '', '| License | Packages |', '|---|---|');
  for (const [k, v] of Object.entries(r.summary.byLicense).sort((a, b) => b[1] - a[1])) l.push(`| ${esc(k)} | ${v} |`);
  l.push('', '</details>');
  if (r.suppressed.length) l.push('', `_${r.suppressed.length} finding(s) covered by exceptions._`);
  return l.join('\n') + '\n';
}

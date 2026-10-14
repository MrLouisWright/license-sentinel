#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { auditAsync, auditWorkspaces, exceeds, formatText, formatJson, formatSarif, formatMarkdown, formatCsv, formatAttributionHtml, formatAttributionMarkdown, renderTemplate, toCycloneDX, toSPDX, toNotices, SEVERITIES, RULES, PRESETS, ConfigError } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const HELP = `license-sentinel ${pkg.version} — license compliance gate and SBOM generator for npm projects

Usage: license-sentinel [dir] [options]

Dependencies
      --source <s>          auto (default: node_modules if present, else lockfile) | node_modules | lockfile | <lockfile path>
      --registry            Look up licenses missing from lockfiles on the npm registry 
      --registry-url <url>  Registry for --registry (default https://registry.npmjs.org; token: LICENSE_SENTINEL_REGISTRY_TOKEN)
      --include-dev         Also audit devDependencies (default: production only)
      --prod                Production dependencies only (default)
      --omit <type>         npm-style omit list (e.g. dev — same as --prod)
      --workspaces          Audit every workspace package (npm/pnpm/yarn monorepos)
      --workspace-report-dir <dir>  With --workspaces, write one JSON report per workspace
Policy
      --preset <p>          permissive | weak-copyleft | strong-copyleft
      --allow <ids>         Allowed licenses/categories, comma-separated or repeated (e.g. MIT,ISC,category:permissive)
      --deny <ids>          Denied licenses (globs ok: "GPL-*,AGPL-*")
      --project-license <e> Override the project's own license (default: package.json "license")
  -c, --config <file>       JSON config (default: .license-sentinel.json, or "licenseSentinel" in package.json)
Output
  -f, --format <fmt>        text (default) | json | sarif | markdown
      --json <file>         Write the JSON report
      --sarif <file>        Write SARIF
      --markdown <file>     Write Markdown
      --cyclonedx <file>    Write a CycloneDX 1.6 JSON SBOM (validated in CI against the official schema)
      --spdx <file>         Write an SPDX 2.3 JSON SBOM
      --notices <file>      Write a third-party NOTICES / attribution file
      --csv <file>          Write a CSV inventory
      --html <file>         Write an HTML attribution page
      --attribution-md <file>  Write a Markdown attribution table
      --template <file>     Custom template file to render (see README)
      --template-out <file> Output path for --template (default: <template>.out)
      --reproducible        Deterministic SBOM serial numbers / namespaces
      --verbose             List every package in text output
      --fail-on <sev>       critical | high (default) | medium | low | info | none
      --list-rules          Print rules and default severities
      --no-color            Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.`;

function list(v) { return (v || []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean); }
function usage(msg) { process.stderr.write(`license-sentinel: ${msg}\nRun with --help for usage.\n`); return 2; }

async function main() {
  let a;
  try {
    a = parseArgs({ allowPositionals: true, options: {
      source: { type: 'string' }, registry: { type: 'boolean' }, 'registry-url': { type: 'string' },
      'include-dev': { type: 'boolean' }, prod: { type: 'boolean' }, omit: { type: 'string' },
      workspaces: { type: 'boolean' }, 'workspace-report-dir': { type: 'string' },
      preset: { type: 'string' }, allow: { type: 'string', multiple: true }, deny: { type: 'string', multiple: true }, 'project-license': { type: 'string' },
      config: { type: 'string', short: 'c' }, format: { type: 'string', short: 'f' },
      json: { type: 'string' }, sarif: { type: 'string' }, markdown: { type: 'string' }, cyclonedx: { type: 'string' }, spdx: { type: 'string' }, notices: { type: 'string' },
      csv: { type: 'string' }, html: { type: 'string' }, 'attribution-md': { type: 'string' }, template: { type: 'string' }, 'template-out': { type: 'string' },
      reproducible: { type: 'boolean' }, verbose: { type: 'boolean' }, 'fail-on': { type: 'string' }, 'list-rules': { type: 'boolean' }, 'no-color': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' }, help: { type: 'boolean', short: 'h' },
    } });
  } catch (e) { return usage(e.message); }
  const { values: o, positionals } = a;
  if (o.help) { process.stdout.write(HELP + '\n'); return 0; }
  if (o.version) { process.stdout.write(pkg.version + '\n'); return 0; }
  if (o['list-rules']) { for (const [id, r] of Object.entries(RULES)) process.stdout.write(`${id.padEnd(22)} ${r.severity.padEnd(9)} ${r.title}\n`); return 0; }
  if (positionals.length > 1) return usage('Only one project directory may be given');
  const dir = resolve(positionals[0] || '.');
  if (!existsSync(dir)) return usage(`No such directory: ${dir}`);

  let config = {};
  const cfgPath = o.config || (existsSync(join(dir, '.license-sentinel.json')) ? join(dir, '.license-sentinel.json') : null);
  try {
    if (cfgPath) config = JSON.parse(readFileSync(cfgPath, 'utf8'));
    else { const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); if (pj.licenseSentinel) config = pj.licenseSentinel; }
  } catch (e) { if (cfgPath) return usage(`Cannot read config ${cfgPath}: ${e.message}`); }
  if (o.preset) config.preset = o.preset;
  if (o.allow) config.allow = [...(config.allow || []), ...list(o.allow)];
  if (o.deny) config.deny = [...(config.deny || []), ...list(o.deny)];
  if (o['project-license']) config.projectLicense = o['project-license'];
  if (o['include-dev']) config.includeDev = true;
  if (o.prod || o.omit === 'dev') config.includeDev = false;
  if (o.omit && o.omit !== 'dev') return usage(`Unsupported --omit value: ${o.omit} (only "dev" is supported)`);
  if (o['registry-url']) config.registry = o['registry-url']; else if (o.registry) config.registry = true;
  if (o.source) config.source = o.source === 'auto' || o.source === 'node_modules' || o.source === 'lockfile' ? o.source : resolve(o.source);
  const failOn = o['fail-on'] || config.failOn || 'high';
  if (failOn !== 'none' && !SEVERITIES.includes(failOn)) return usage(`Invalid --fail-on: ${failOn}`);
  const format = o.format || 'text';
  if (!['text', 'json', 'sarif', 'markdown'].includes(format)) return usage(`Invalid --format: ${format}`);
  if (config.preset && !PRESETS[config.preset]) return usage(`Unknown preset "${config.preset}"`);

  const tplOpts = { includeDev: !!config.includeDev };
  const writeExtras = (report) => {
    if (o.csv) writeFileSync(o.csv, formatCsv(report, tplOpts));
    if (o.html) writeFileSync(o.html, formatAttributionHtml(report, tplOpts));
    if (o['attribution-md']) writeFileSync(o['attribution-md'], formatAttributionMarkdown(report, tplOpts));
    if (o.template) {
      const dest = o['template-out'] || `${o.template}.out`;
      writeFileSync(dest, renderTemplate(readFileSync(o.template, 'utf8'), report, tplOpts));
    }
  };

  if (o.workspaces) {
    let mono;
    try { mono = auditWorkspaces(dir, config); } catch (e) { return usage(e instanceof ConfigError ? `Config error: ${e.message}` : e.message); }
    if (format === 'json') process.stdout.write(JSON.stringify(mono, null, 2) + '\n');
    else {
      for (const { workspace, report } of mono.workspaces) {
        process.stdout.write(`\n=== ${workspace.relativePath} (${workspace.name}) ===\n`);
        process.stdout.write(formatText(report, { color: !o['no-color'] && process.stdout.isTTY && !process.env.NO_COLOR, failOn, verbose: o.verbose }));
      }
    }
    try {
      if (o['workspace-report-dir']) {
        mkdirSync(o['workspace-report-dir'], { recursive: true });
        for (const { workspace, report } of mono.workspaces) {
          const safe = workspace.relativePath.replace(/[^\w.-]+/g, '_') || 'root';
          writeFileSync(join(o['workspace-report-dir'], `${safe}.json`), formatJson(report));
        }
      }
      if (o.json) writeFileSync(o.json, JSON.stringify(mono, null, 2));
      const fail = mono.workspaces.some(({ report }) => exceeds(report, failOn));
      return fail ? 1 : 0;
    } catch (e) { return usage(`Cannot write output: ${e.message}`); }
  }

  let report;
  try { report = await auditAsync(dir, config, { token: process.env.LICENSE_SENTINEL_REGISTRY_TOKEN }); } catch (e) { return usage(e instanceof ConfigError ? `Config error: ${e.message}` : e.message); }
  if (report.registryErrors?.length) process.stderr.write(`license-sentinel: registry lookup failed for ${report.registryErrors.length} package(s), e.g. ${report.registryErrors[0].package}: ${report.registryErrors[0].error}\n`);
  const color = !o['no-color'] && process.stdout.isTTY && !process.env.NO_COLOR;
  const sbomOpts = { toolVersion: pkg.version, reproducible: !!o.reproducible };
  const out = { text: () => formatText(report, { color, failOn, verbose: o.verbose }), json: () => formatJson(report), sarif: () => formatSarif(report, { version: pkg.version }), markdown: () => formatMarkdown(report, { failOn }) };
  process.stdout.write(out[format]());
  try {
    if (o.json) writeFileSync(o.json, formatJson(report));
    if (o.sarif) writeFileSync(o.sarif, formatSarif(report, { version: pkg.version }));
    if (o.markdown) writeFileSync(o.markdown, formatMarkdown(report, { failOn }));
    if (o.cyclonedx) writeFileSync(o.cyclonedx, toCycloneDX(report, sbomOpts));
    if (o.spdx) writeFileSync(o.spdx, toSPDX(report, sbomOpts));
    if (o.notices) writeFileSync(o.notices, toNotices(report, tplOpts));
    writeExtras(report);
  } catch (e) { return usage(`Cannot write output: ${e.message}`); }
  return exceeds(report, failOn) ? 1 : 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write(`license-sentinel: ${e.stack || e}\n`); process.exitCode = 2; });

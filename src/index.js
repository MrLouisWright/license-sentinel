import { collectProject, fromNodeModules, fromNpmLock, fromPnpmLock, fromYarnLock } from './collect.js';
import { resolveLicense, noticeInfo } from './resolve.js';
import { RULES, SEVERITIES, sevRank, PRESETS, evaluate, buildPolicy, projectCategory, matchException, entryMatches } from './policy.js';
import { parse, stringify, options, category, normaliseId, CATEGORIES } from './spdx.js';
import { detectLicenseText } from './detect.js';
import { enrichFromRegistry } from './registry.js';
export { enrichFromRegistry };
import { parseYaml } from './yaml.js';
export { formatText, formatJson, formatSarif, formatMarkdown } from './report.js';
export { toCycloneDX, toSPDX, toNotices } from './sbom.js';
export { collectProject, fromNodeModules, fromNpmLock, fromPnpmLock, fromYarnLock, resolveLicense, parse as parseSpdx, stringify as stringifySpdx, options as spdxOptions, category as licenseCategory, normaliseId, detectLicenseText, parseYaml, RULES, SEVERITIES, PRESETS, CATEGORIES, entryMatches };

export class ConfigError extends Error {}

export function validateConfig(config = {}) {
  if (config.preset && !PRESETS[config.preset]) throw new ConfigError(`Unknown preset "${config.preset}" (use ${Object.keys(PRESETS).join(', ')})`);
  for (const k of ['allow', 'deny', 'exceptions', 'ignore']) if (config[k] !== undefined && !Array.isArray(config[k])) throw new ConfigError(`"${k}" must be an array`);
  for (const [i, ex] of (config.exceptions || []).entries()) {
    if (!ex || typeof ex !== 'object' || !ex.package) throw new ConfigError(`exceptions[${i}] needs "package"`);
    if (!ex.reason || !String(ex.reason).trim()) throw new ConfigError(`exceptions[${i}] (${ex.package}) needs a "reason"`);
    if (ex.expires && Number.isNaN(Date.parse(ex.expires))) throw new ConfigError(`exceptions[${i}] (${ex.package}) has an invalid "expires" date`);
    if (ex.license) { try { parse(ex.license); } catch (e) { throw new ConfigError(`exceptions[${i}] (${ex.package}) license: ${e.message}`); } }
  }
  for (const [r, s] of Object.entries(config.severity || {})) {
    if (!RULES[r]) throw new ConfigError(`Unknown rule in "severity": ${r}`);
    if (s !== 'off' && !SEVERITIES.includes(s)) throw new ConfigError(`Invalid severity for ${r}: ${s}`);
  }
  return config;
}

/**
 * Audit a project directory.
 * config: { preset, allow, deny, exceptions, severity, projectLicense, includeDev, source, ignore, includePrivate, now }
 */
export function audit(dir, config = {}) {
  validateConfig(config);
  const collected = collectProject(dir, { source: config.source || 'auto' });
  return auditCollected(collected, config);
}

/** Async audit; with config.registry (true or a URL) missing lockfile licenses are looked up on the registry. */
export async function auditAsync(dir, config = {}, { fetchImpl, token } = {}) {
  validateConfig(config);
  const collected = collectProject(dir, { source: config.source || 'auto' });
  let registryErrors = [];
  if (config.registry) {
    const r = await enrichFromRegistry(collected, { registry: typeof config.registry === 'string' ? config.registry : undefined, fetchImpl, token });
    registryErrors = r.errors;
  }
  const report = auditCollected(collected, config);
  report.registryErrors = registryErrors;
  return report;
}

export function auditCollected(collected, config = {}) {
  validateConfig(config);
  const now = config.now ? new Date(config.now) : new Date();
  const today = now.toISOString().slice(0, 10);
  const project = projectCategory(collected.root, config);
  const policy = buildPolicy(config, project);
  const ignore = config.ignore || [];
  const exceptions = (config.exceptions || []).map((e) => ({ ...e, used: false, expired: !!(e.expires && e.expires < today) }));
  const findings = []; const suppressed = []; const packages = [];
  const pkgList = collected.packages.filter((p) => (config.includeDev || !p.dev) && !ignore.some((g) => matchException({ package: g }, p)) && !(p.private && !config.includePrivate && !p.version?.match(/^\d/)));
  for (const pkg of pkgList) {
    const exs = exceptions.filter((e) => matchException(e, pkg));
    let lic = resolveLicense(pkg);
    const licEx = exs.find((e) => e.license && !e.expired);
    if (licEx) { const p = parse(licEx.license); lic = { expression: stringify(p.ast), ast: p.ast, declared: lic.declared, detected: lic.detected, source: `exception (${licEx.reason})`, warnings: [], overridden: true }; licEx.used = true; }
    const ev = evaluate(pkg, lic, policy);
    for (const f of ev.findings) {
      const ex = exs.find((e) => !e.license && (!e.rules || e.rules.includes(f.rule)));
      if (ex && !ex.expired) { ex.used = true; suppressed.push({ ...f, exception: { reason: ex.reason, expires: ex.expires } }); continue; }
      if (ex && ex.expired) { ex.used = true; f.message += ` (exception expired ${ex.expires})`; }
      findings.push(f);
    }
    for (const e of exs.filter((x) => x.expired)) {
      e.used = true;
      findings.push({ rule: 'exception-expired', severity: RULES['exception-expired'].severity, package: pkg.name, version: pkg.version, license: lic.expression, dev: !!pkg.dev, message: `Exception for ${e.package} expired on ${e.expires} ("${e.reason}")`, fix: 'Re-review the package and extend "expires", or remove the dependency.' });
    }
    packages.push({ name: pkg.name, version: pkg.version, ref: pkg.ref, dev: !!pkg.dev, ...(pkg.extraneous ? { extraneous: true } : {}), license: lic.expression, declared: lic.declared ?? null, detected: lic.detected ?? null, licenseSource: lic.source, chosen: ev.chosen, category: ev.category, path: pkg.paths?.[0] ?? pkg.path, resolved: pkg.resolved, integrity: pkg.integrity, author: pkg.author, homepage: pkg.homepage, repository: pkg.repository, description: pkg.description, dependencies: pkg.dependencies || [], ...noticeInfo(pkg) });
  }
  for (const e of exceptions.filter((x) => !x.used)) findings.push({ rule: 'exception-unused', severity: RULES['exception-unused'].severity, package: e.package, version: '', license: null, dev: false, message: `Exception for "${e.package}" did not match any audited package`, fix: 'Remove stale exceptions to keep the policy honest.' });
  // severity overrides
  const sev = config.severity || {};
  const final = findings.filter((f) => sev[f.rule] !== 'off').map((f) => (SEVERITIES.includes(sev[f.rule]) ? { ...f, severity: sev[f.rule] } : f));
  final.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.package.localeCompare(b.package));
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, final.filter((f) => f.severity === s).length]));
  const byCategory = {};
  for (const p of packages) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  const byLicense = {};
  for (const p of packages) { const k = p.license || '(unknown)'; byLicense[k] = (byLicense[k] || 0) + 1; }
  return {
    tool: 'license-sentinel', generatedAt: now.toISOString(),
    project: { name: collected.root?.name, version: collected.root?.version, license: project.license, category: project.category, dir: collected.dir, source: collected.source, lockfile: collected.lockfile },
    policy: { preset: config.preset || null, allow: policy.allow, deny: policy.deny, includeDev: !!config.includeDev },
    summary: { packages: packages.length, prod: packages.filter((p) => !p.dev).length, dev: packages.filter((p) => p.dev).length, byCategory, byLicense },
    packages, findings: final, suppressed, counts,
  };
}

export function exceeds(report, failOn = 'high') {
  if (failOn === 'none') return false;
  return report.findings.some((f) => sevRank(f.severity) <= sevRank(failOn));
}

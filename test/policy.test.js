import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, exceeds, validateConfig, ConfigError } from '../src/index.js';
import { mixedProject, makeProject } from './helpers.js';

const NOW = '2026-10-13T12:00:00Z';
const dir = mixedProject();
const run = (cfg = {}) => audit(dir, { now: NOW, ...cfg });
const f = (r, pkg, rule) => r.findings.find((x) => x.package === pkg && (!rule || x.rule === rule));
const pk = (r, name) => r.packages.find((p) => p.name === name);

test('resolves licenses from fields, files, legacy forms and SEE LICENSE IN', () => {
  const r = run();
  assert.equal(r.project.license, 'MIT'); assert.equal(r.project.category, 'permissive');
  assert.equal(pk(r, 'textonly').license, 'Apache-2.0'); assert.match(pk(r, 'textonly').licenseSource, /LICENSE\.txt/);
  assert.equal(pk(r, 'legacy').license, 'MIT OR Apache-2.0');
  assert.equal(pk(r, 'aliased').license, 'Apache-2.0');
  assert.equal(pk(r, 'seefile').license, 'ISC');
  assert.equal(pk(r, 'dual').chosen, 'MIT');
  assert.equal(pk(r, 'classpath').category, 'weak-copyleft');
  assert.deepEqual(pk(r, 'mit-lib').copyright, ['Copyright (c) 2024 Jane Doe']);
  assert.equal(r.summary.prod, 16); assert.equal(r.summary.dev, 0);
});
test('default checks: project compatibility, unknown/missing/UNLICENSED, mismatches, invalid SPDX', () => {
  const r = run();
  assert.equal(f(r, 'gpl-lib', 'incompatible-license').severity, 'high');
  assert.equal(f(r, 'agpl-lib', 'incompatible-license').severity, 'critical');
  assert.equal(f(r, 'lgpl-lib', 'incompatible-license').severity, 'low');
  assert.equal(f(r, 'dual'), undefined, 'OR picks the MIT option');
  assert.equal(f(r, 'proprietary', 'unlicensed').severity, 'high');
  assert.equal(f(r, 'nolicense', 'missing-license').severity, 'medium');
  assert.equal(f(r, 'unknowntext', 'unknown-license').severity, 'medium');
  assert.ok(f(r, 'mismatch', 'license-mismatch'));
  assert.ok(f(r, 'aliased', 'invalid-spdx'));
  assert.equal(f(r, 'mit-lib'), undefined);
  assert.equal(exceeds(r, 'critical'), true);
});
test('dev deps are excluded by default, included and capped to low with includeDev', () => {
  assert.equal(pk(run(), 'dev-gpl'), undefined);
  const r = run({ includeDev: true });
  assert.equal(pk(r, 'dev-gpl').dev, true);
  assert.equal(f(r, 'dev-gpl', 'incompatible-license').severity, 'low');
});
test('presets and allow lists; OR chooses any allowed option', () => {
  const r = run({ preset: 'permissive' });
  assert.equal(f(r, 'gpl-lib', 'not-allowed').severity, 'high');
  assert.ok(f(r, 'lgpl-lib', 'not-allowed'));
  assert.equal(f(r, 'dual', 'not-allowed'), undefined);
  assert.equal(f(r, 'mit-lib'), undefined);
  const w = run({ preset: 'weak-copyleft' });
  assert.equal(f(w, 'lgpl-lib', 'not-allowed'), undefined);
  assert.ok(f(w, 'gpl-lib', 'not-allowed'));
  const s = run({ preset: 'strong-copyleft', projectLicense: 'GPL-3.0-or-later' });
  assert.equal(f(s, 'gpl-lib'), undefined);
  assert.equal(f(s, 'agpl-lib', 'incompatible-license').severity, 'medium');
  const a = run({ allow: ['MIT', 'ISC'] });
  assert.ok(f(a, '@acme/thing', 'not-allowed'));
  assert.equal(f(a, 'legacy', 'not-allowed'), undefined, 'MIT option is allowed');
  const g = run({ allow: ['category:permissive', 'BSD-*'] });
  assert.equal(f(g, '@acme/thing', 'not-allowed'), undefined);
});
test('deny list wins over allow; OR escapes a denied option; globs', () => {
  const r = run({ deny: ['GPL-*', 'AGPL-3.0-only'] });
  assert.ok(f(r, 'gpl-lib', 'denied-license'));
  assert.ok(f(r, 'agpl-lib', 'denied-license'));
  assert.equal(f(r, 'dual', 'denied-license'), undefined);
  assert.equal(f(r, 'gpl-lib', 'incompatible-license'), undefined, 'not double-reported');
  const all = run({ deny: ['MIT', 'GPL-*'] });
  assert.ok(f(all, 'dual', 'denied-license'));
  assert.ok(f(run({ deny: ['strong-copyleft'] }), 'gpl-lib', 'denied-license'));
});
test('project license category check uses root LICENSE text when no field; override flag', () => {
  const d = makeProject({ name: 'nolic', version: '1.0.0', dependencies: { g: '1' } }, { 'node_modules/g': { pj: { name: 'g', version: '1.0.0', license: 'GPL-3.0-only' } } }, { LICENSE: 'Permission is hereby granted, free of charge, to any person obtaining a copy The above copyright notice and this permission notice shall be included' });
  const r = audit(d, { now: NOW });
  assert.equal(r.project.license, 'MIT'); assert.ok(f(r, 'g', 'incompatible-license'));
  assert.equal(f(audit(d, { now: NOW, projectLicense: 'GPL-3.0-only' }), 'g'), undefined);
  const prop = audit(d, { now: NOW, projectLicense: 'UNLICENSED' });
  assert.equal(prop.project.category, 'proprietary'); assert.ok(f(prop, 'g', 'incompatible-license'));
});
test('exceptions: suppress with reason, license override, rule-scoped, expiry and unused', () => {
  const r = run({ exceptions: [
    { package: 'gpl-lib', reason: 'Legal approved, internal tool only', expires: '2027-01-01' },
    { package: 'nolicense@0.0.x', license: 'MIT', reason: 'Confirmed MIT upstream (issue #12)' },
    { package: 'agpl-lib', reason: 'Old approval', expires: '2026-01-01' },
    { package: 'mismatch', rules: ['license-mismatch'], reason: 'BSD text checked' },
    { package: 'not-installed', reason: 'stale' },
  ] });
  assert.equal(f(r, 'gpl-lib'), undefined);
  assert.ok(r.suppressed.some((s) => s.package === 'gpl-lib' && s.exception.reason.startsWith('Legal')));
  assert.equal(pk(r, 'nolicense').license, 'MIT'); assert.equal(f(r, 'nolicense'), undefined);
  assert.ok(f(r, 'agpl-lib', 'exception-expired'));
  assert.match(f(r, 'agpl-lib', 'incompatible-license').message, /exception expired 2026-01-01/);
  assert.equal(f(r, 'mismatch', 'license-mismatch'), undefined);
  assert.equal(f(r, 'not-installed', 'exception-unused').severity, 'info');
});
test('severity overrides and "off"; findings sorted by severity', () => {
  const r = run({ severity: { 'missing-license': 'critical', 'invalid-spdx': 'off' } });
  assert.equal(f(r, 'nolicense', 'missing-license').severity, 'critical');
  assert.equal(r.findings.filter((x) => x.rule === 'invalid-spdx').length, 0);
  const ranks = r.findings.map((x) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(x.severity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});
test('config validation', () => {
  assert.throws(() => validateConfig({ preset: 'nope' }), ConfigError);
  assert.throws(() => validateConfig({ exceptions: [{ package: 'x' }] }), /reason/);
  assert.throws(() => validateConfig({ exceptions: [{ package: 'x', reason: 'r', expires: 'soon' }] }), /expires/);
  assert.throws(() => validateConfig({ severity: { bogus: 'high' } }), /Unknown rule/);
  assert.throws(() => validateConfig({ exceptions: [{ package: 'x', reason: 'r', license: 'MIT AND' }] }), /license/);
});
test('lockfile-only audit uses lockfile licenses and reports missing info', () => {
  const d = makeProject({ name: 'lk', version: '1.0.0', license: 'MIT', dependencies: { a: '1', b: '1' } }, {}, { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.0.0', license: 'GPL-2.0' }, 'node_modules/b': { version: '1.0.0' } } }) });
  const r = audit(d, { now: NOW });
  assert.equal(pk(r, 'a').license, 'GPL-2.0-only');
  assert.ok(f(r, 'a', 'incompatible-license'));
  assert.match(f(r, 'b', 'unresolved-license').message, /no license data/);
});

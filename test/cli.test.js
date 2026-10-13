import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mixedProject, makeProject, tmp } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/license-sentinel.js', import.meta.url));
const run = (args, cwd) => { const p = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd, env: { ...process.env, NO_COLOR: '1' } }); return { code: p.status, out: p.stdout, err: p.stderr }; };
const mixed = mixedProject();
const clean = makeProject({ name: 'clean', version: '1.0.0', license: 'MIT', dependencies: { a: '1' } }, { 'node_modules/a': { pj: { name: 'a', version: '1.0.0', license: 'ISC' } } });

test('exit codes 0 / 1 / 2', () => {
  assert.equal(run([clean, '--preset', 'permissive', '--fail-on', 'info']).code, 0);
  const r = run([mixed]); assert.equal(r.code, 1); assert.match(r.out, /incompatible-license/);
  assert.equal(run([mixed, '--fail-on', 'none']).code, 0);
  assert.equal(run(['/does/not/exist']).code, 2);
  assert.equal(run([mixed, '--fail-on', 'bad']).code, 2);
  assert.equal(run([mixed, '--preset', 'bad']).code, 2);
  assert.equal(run([makeProject({ name: 'e' })]).code, 2);
  assert.equal(run([mixed, '-f', 'xml']).code, 2);
});
test('--fail-on thresholds', () => {
  assert.equal(run([mixed, '--fail-on', 'critical']).code, 1); // AGPL
  assert.equal(run([clean, '--allow', 'MIT', '--fail-on', 'high']).code, 1); // ISC not allowed
  assert.equal(run([clean, '--allow', 'MIT,ISC', '--fail-on', 'low']).code, 0);
});
test('--deny, --include-dev, --project-license and positional cwd default', () => {
  const d = JSON.parse(run([mixed, '--deny', 'GPL-*', '-f', 'json']).out);
  assert.ok(d.findings.some((f) => f.rule === 'denied-license' && f.package === 'gpl-lib'));
  const dev = JSON.parse(run([mixed, '--include-dev', '-f', 'json']).out);
  assert.ok(dev.packages.some((p) => p.name === 'dev-gpl'));
  const g = JSON.parse(run(['--project-license', 'AGPL-3.0-only', '-f', 'json'], mixed).out);
  assert.equal(g.project.category, 'network-copyleft');
  assert.ok(!g.findings.some((f) => f.rule === 'incompatible-license'));
});
test('config file and package.json "licenseSentinel"', () => {
  const cfg = join(tmp(), 'c.json');
  writeFileSync(cfg, JSON.stringify({ preset: 'permissive', failOn: 'critical', exceptions: [{ package: 'agpl-lib', reason: 'approved' }], severity: { 'not-allowed': 'low' } }));
  assert.equal(run([mixed, '-c', cfg]).code, 0);
  writeFileSync(cfg, JSON.stringify({ exceptions: [{ package: 'x' }] }));
  const bad = run([mixed, '-c', cfg]); assert.equal(bad.code, 2); assert.match(bad.err, /reason/);
  const p = makeProject({ name: 'pc', version: '1.0.0', license: 'MIT', dependencies: { a: '1' }, licenseSentinel: { deny: ['ISC'] } }, { 'node_modules/a': { pj: { name: 'a', version: '1.0.0', license: 'ISC' } } });
  assert.match(run([p]).out, /denied-license/);
  writeFileSync(join(p, '.license-sentinel.json'), '{}');
  assert.doesNotMatch(run([p]).out, /denied-license/, '.license-sentinel.json wins');
});
test('all output files', () => {
  const o = tmp();
  const f = (n) => join(o, n);
  const r = run([mixed, '--include-dev', '--json', f('r.json'), '--sarif', f('r.sarif'), '--markdown', f('r.md'), '--cyclonedx', f('bom.cdx.json'), '--spdx', f('bom.spdx.json'), '--notices', f('NOTICES.txt'), '--reproducible']);
  assert.equal(r.code, 1);
  assert.ok(JSON.parse(readFileSync(f('r.json'), 'utf8')).findings.length);
  assert.equal(JSON.parse(readFileSync(f('r.sarif'), 'utf8')).version, '2.1.0');
  assert.match(readFileSync(f('r.md'), 'utf8'), /license-sentinel/);
  assert.equal(JSON.parse(readFileSync(f('bom.cdx.json'), 'utf8')).specVersion, '1.5');
  assert.equal(JSON.parse(readFileSync(f('bom.spdx.json'), 'utf8')).spdxVersion, 'SPDX-2.3');
  assert.match(readFileSync(f('NOTICES.txt'), 'utf8'), /dev-gpl/);
  for (const fmt of ['json', 'sarif', 'markdown']) assert.ok(run([mixed, '-f', fmt]).out.length > 50);
});
test('lockfile-only fixtures via --source', () => {
  const fx = fileURLToPath(new URL('./fixtures/npm-v3', import.meta.url));
  const j = JSON.parse(run([fx, '-f', 'json', '--include-dev']).out);
  assert.equal(j.project.source, 'package-lock');
  assert.ok(j.findings.some((f) => f.package === 'copyleft' && f.rule === 'incompatible-license'));
  assert.ok(j.findings.some((f) => f.package === 'mystery' && f.rule === 'unresolved-license'));
  const pn = JSON.parse(run([fileURLToPath(new URL('./fixtures/pnpm-v9', import.meta.url)), '-f', 'json']).out);
  assert.equal(pn.summary.prod, 4);
  assert.equal(run([mixed, '--source', fx + '/package-lock.json', '-f', 'json']).code, 1);
});
test('--help, --version, --list-rules', () => {
  assert.match(run(['--help']).out, /Exit codes/);
  assert.match(run(['--version']).out, /^\d+\.\d+\.\d+/);
  assert.match(run(['--list-rules']).out, /incompatible-license/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditAsync } from '../src/index.js';
import { makeProject } from './helpers.js';

const META = { '/left/1.2.0': { license: 'MIT', homepage: 'https://left.dev' }, '/pad/1.0.1': { licenses: [{ type: 'ISC' }] }, '/copyleft/2.0.0': { license: 'GPL-3.0-only' }, '/pad/2.0.0': { license: 'AGPL-3.0-only' }, '/tester/3.1.0': {}, '/@scope%2Finner/0.3.0': { license: 'BSD-2-Clause' } };
let server, base; const seen = [];
test.before(async () => {
  server = http.createServer((req, res) => { seen.push({ url: req.url, auth: req.headers.authorization }); const m = META[req.url]; if (!m) { res.statusCode = 404; return res.end('{}'); } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(m)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

test('lockfile-only audit enriched from a registry (pnpm v9, scoped names, legacy licenses[])', async () => {
  const r = await auditAsync(fx('pnpm-v9'), { registry: base, includeDev: true, now: '2026-10-13T00:00:00Z' }, { token: 'tok' });
  const lic = Object.fromEntries(r.packages.map((p) => [p.ref, p.license]));
  assert.deepEqual(lic, { '@scope/inner@0.3.0': 'BSD-2-Clause', 'copyleft@2.0.0': 'GPL-3.0-only', 'left@1.2.0': 'MIT', 'pad@1.0.1': 'ISC', 'pad@2.0.0': 'AGPL-3.0-only', 'tester@3.1.0': null });
  assert.ok(r.findings.some((f) => f.package === 'tester' && f.rule === 'missing-license'));
  assert.ok(r.findings.some((f) => f.package === 'copyleft' && f.rule === 'incompatible-license' && f.severity === 'high'));
  assert.ok(r.findings.some((f) => f.package === 'pad' && f.version === '2.0.0' && f.severity === 'low'), 'dev AGPL capped to low');
  assert.ok(seen.some((s) => s.url === '/@scope%2Finner/0.3.0' && s.auth === 'Bearer tok'));
});
test('registry errors are reported, not fatal; without --registry lockfile gaps are unresolved', async () => {
  const d = makeProject({ name: 'x', version: '1.0.0', license: 'MIT', dependencies: { ghost: '1' } }, {}, { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/ghost': { version: '9.9.9' } } }) });
  const r = await auditAsync(d, { registry: base });
  assert.equal(r.registryErrors.length, 1); assert.match(r.registryErrors[0].error, /404/);
  assert.equal(r.findings[0].rule, 'unresolved-license');
  const p = spawn(process.execPath, [fileURLToPath(new URL('../bin/license-sentinel.js', import.meta.url)), fx('yarn-berry'), '--registry-url', base, '-f', 'json']);
  let out = ''; p.stdout.on('data', (c) => (out += c));
  const code = await new Promise((r) => p.on('close', r));
  assert.equal(code, 1);
  const j = JSON.parse(out);
  assert.equal(j.packages.find((x) => x.name === 'left').license, 'MIT');
  assert.ok(j.findings.some((f) => f.package === 'copyleft' && f.rule === 'incompatible-license'));
});

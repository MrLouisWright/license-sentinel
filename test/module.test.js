import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ESM import from source', async () => {
  const mod = await import('../src/index.js');
  assert.equal(typeof mod.audit, 'function');
  assert.equal(typeof mod.toCycloneDX, 'function');
  assert.equal(typeof mod.auditWorkspaces, 'function');
});

test('CJS require from dist after build', () => {
  const req = createRequire(import.meta.url);
  const mod = req(join(root, 'dist/index.cjs'));
  assert.equal(typeof mod.audit, 'function');
  assert.equal(typeof mod.formatCsv, 'function');
  const r = mod.audit(join(root, 'test/fixtures/npm-v3'), { failOn: 'none', includeDev: true });
  assert.ok(r.summary.packages >= 1);
});

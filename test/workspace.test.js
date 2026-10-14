import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWorkspaces, discoverWorkspaces } from '../src/index.js';
import { makeProject } from './helpers.js';

test('discovers npm workspaces and audits each package separately', () => {
  const root = makeProject(
    { name: 'mono-root', version: '1.0.0', private: true, workspaces: ['packages/*'], dependencies: { lodash: '1' } },
    {
      'node_modules/lodash': { pj: { name: 'lodash', version: '1.0.0', license: 'MIT' } },
      'packages/app-a': { pj: { name: 'app-a', version: '1.0.0', license: 'MIT', dependencies: { lodash: '1' } } },
      'packages/app-b': { pj: { name: 'app-b', version: '2.0.0', license: 'MIT', devDependencies: { 'dev-only': '1' } } },
      'node_modules/dev-only': { pj: { name: 'dev-only', version: '1.0.0', license: 'GPL-3.0-only' } },
    },
  );
  const ws = discoverWorkspaces(root);
  assert.equal(ws.length, 2);
  assert.deepEqual(ws.map((w) => w.name).sort(), ['app-a', 'app-b']);
  const out = auditWorkspaces(root, { now: '2026-10-13T12:00:00Z' });
  assert.equal(out.mode, 'monorepo');
  const a = out.workspaces.find((w) => w.workspace.name === 'app-a').report;
  const b = out.workspaces.find((w) => w.workspace.name === 'app-b').report;
  assert.ok(a.packages.some((p) => p.name === 'lodash'));
  assert.equal(b.packages.some((p) => p.name === 'dev-only'), false, 'production-only by default');
  assert.equal(b.summary.dev, 0);
});

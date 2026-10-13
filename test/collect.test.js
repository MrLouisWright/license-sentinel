import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectProject, parseYaml } from '../src/index.js';
import { makeProject, mixedProject, TEXTS } from './helpers.js';

const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const view = (c) => Object.fromEntries(c.packages.map((p) => [p.ref, p.dev ? 'dev' : 'prod']));
const EXPECTED = { 'copyleft@2.0.0': 'prod', 'left@1.2.0': 'prod', 'pad@1.0.1': 'prod', 'pad@2.0.0': 'dev', 'tester@3.1.0': 'dev' };

for (const name of ['npm-v3', 'npm-v1', 'pnpm-v9', 'pnpm-v6', 'yarn-v1', 'yarn-berry']) {
  test(`lockfile ${name}: transitive deps with prod/dev classification`, () => {
    const c = collectProject(fx(name));
    const v = view(c);
    for (const [k, d] of Object.entries(EXPECTED)) assert.equal(v[k], d, `${name} ${k}`);
    if (name !== 'npm-v1') assert.deepEqual(c.packages.find((p) => p.name === 'left').dependencies, ['pad@1.0.1']);
    assert.ok(!c.packages.some((p) => p.name === 'fixture-app'), 'root/workspace excluded');
  });
}
test('npm lockfile v3 carries license and integrity; pnpm v9 resolves peer-suffixed and scoped keys', () => {
  const c = collectProject(fx('npm-v3'));
  assert.equal(c.packages.find((p) => p.name === 'copyleft').lockLicense, 'GPL-3.0-only');
  assert.equal(c.packages.find((p) => p.name === 'left').integrity, 'sha512-AAAA');
  const p = collectProject(fx('pnpm-v9'));
  assert.equal(view(p)['@scope/inner@0.3.0'], 'prod');
  assert.deepEqual(p.packages.find((x) => x.name === 'copyleft').dependencies.sort(), ['@scope/inner@0.3.0', 'left@1.2.0']);
});
test('yarn v1 unreachable entries are extraneous', () => {
  const o = collectProject(fx('yarn-v1')).packages.find((p) => p.name === '@scope/orphan');
  assert.equal(o.extraneous, true); assert.equal(o.dev, true);
});
test('node_modules walk: nested, scoped, symlinked, prod vs dev', () => {
  const dir = mixedProject();
  const c = collectProject(dir);
  assert.equal(c.source, 'node_modules');
  const v = view(c);
  assert.equal(v['nested-isc@1.1.0'], 'prod');
  assert.equal(v['@acme/thing@1.0.0'], 'prod');
  assert.equal(v['dev-gpl@1.0.0'], 'dev');
  assert.equal(c.packages.find((p) => p.name === 'mit-lib').licenseFiles[0].file, 'LICENSE');
  assert.deepEqual(c.packages.find((p) => p.name === 'mit-lib').dependencies, ['nested-isc@1.1.0']);
});
test('pnpm-style node_modules (.pnpm store with symlinks)', () => {
  const dir = makeProject({ name: 'p', version: '1.0.0', license: 'MIT', dependencies: { a: '1' } }, {
    'node_modules/.pnpm/a@1.0.0/node_modules/a': { pj: { name: 'a', version: '1.0.0', license: 'MIT', dependencies: { b: '1' } }, files: { LICENSE: TEXTS.MIT } },
    'node_modules/.pnpm/b@1.0.0/node_modules/b': { pj: { name: 'b', version: '1.0.0', license: 'ISC' } },
    'node_modules/.pnpm/a@1.0.0/node_modules/b': { link: 'node_modules/.pnpm/b@1.0.0/node_modules/b' },
    'node_modules/a': { link: 'node_modules/.pnpm/a@1.0.0/node_modules/a' },
  });
  const c = collectProject(dir);
  assert.deepEqual(view(c), { 'a@1.0.0': 'prod', 'b@1.0.0': 'prod' });
});
test('--source lockfile forces lockfile even when node_modules exists; errors when nothing to read', () => {
  const dir = makeProject({ name: 'p', version: '1.0.0', dependencies: { x: '1' } }, { 'node_modules/x': { pj: { name: 'x', version: '1.0.0', license: 'MIT' } } },
    { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/x': { version: '1.0.0', license: 'MIT' }, 'node_modules/y': { version: '2.0.0', license: 'ISC' } } }) });
  assert.equal(collectProject(dir).source, 'node_modules');
  const lk = collectProject(dir, { source: 'lockfile' });
  assert.equal(lk.source, 'package-lock'); assert.equal(lk.packages.length, 2);
  assert.throws(() => collectProject(makeProject({ name: 'empty' })), /No node_modules or lockfile/);
});
test('yaml subset parser', () => {
  const y = parseYaml("a: 1\nb:\n  'c@1': {integrity: x, n: {d: 2}}\n  e:\n    - f\n    - g: h\nlist: [1, 'two']\nq: \"x: y\"\n");
  assert.deepEqual(y, { a: '1', b: { 'c@1': { integrity: 'x', n: { d: '2' } }, e: ['f', { g: 'h' }] }, list: ['1', 'two'], q: 'x: y' });
});
test('root peerDependencies are not counted as production dependencies', () => {
  const dir = makeProject({ name: 'p', version: '1.0.0', peerDependencies: { host: '*' }, dependencies: { a: '1' } }, { 'node_modules/host': { pj: { name: 'host', version: '1.0.0', license: 'MIT' } }, 'node_modules/a': { pj: { name: 'a', version: '1.0.0', license: 'MIT' } } });
  assert.deepEqual(view(collectProject(dir)), { 'a@1.0.0': 'prod', 'host@1.0.0': 'dev' });
});

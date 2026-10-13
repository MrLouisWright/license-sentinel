import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpdx, stringifySpdx, spdxOptions, licenseCategory, normaliseId, detectLicenseText } from '../src/index.js';
import { TEXTS } from './helpers.js';

const s = (e) => stringifySpdx(parseSpdx(e).ast);
test('parses AND/OR/WITH with precedence and parentheses', () => {
  assert.equal(s('MIT'), 'MIT');
  assert.equal(s('MIT OR Apache-2.0 AND BSD-3-Clause'), 'MIT OR (Apache-2.0 AND BSD-3-Clause)');
  assert.equal(s('(MIT OR Apache-2.0) AND BSD-3-Clause'), '(MIT OR Apache-2.0) AND BSD-3-Clause');
  assert.equal(s('GPL-2.0-only WITH Classpath-exception-2.0'), 'GPL-2.0-only WITH Classpath-exception-2.0');
  const opts = spdxOptions(parseSpdx('(MIT OR Apache-2.0) AND (BSD-2-Clause OR ISC)').ast).map((o) => o.map((l) => l.license).join('+'));
  assert.deepEqual(opts, ['MIT+BSD-2-Clause', 'MIT+ISC', 'Apache-2.0+BSD-2-Clause', 'Apache-2.0+ISC']);
});
test('normalises deprecated and common non-SPDX forms with warnings', () => {
  assert.equal(s('GPL-2.0+'), 'GPL-2.0-or-later');
  assert.equal(s('GPL-3.0'), 'GPL-3.0-only');
  assert.equal(s('Apache License 2.0'), 'Apache-2.0');
  assert.equal(s('MIT/Apache-2.0'), 'MIT OR Apache-2.0');
  assert.equal(s('mit or apache-2.0'), 'MIT OR Apache-2.0');
  assert.ok(parseSpdx('mit or apache-2.0').warnings.length >= 1);
  assert.deepEqual(parseSpdx('MIT AND ISC').warnings, []);
  assert.equal(normaliseId('LicenseRef-Acme').id, 'LicenseRef-Acme');
});
test('rejects malformed expressions', () => {
  for (const e of ['', 'MIT AND', '(MIT', 'MIT) OR ISC', 'OR MIT', 'MIT WITH', 'MIT ISC']) assert.throws(() => parseSpdx(e), undefined, e);
});
test('categories, including linking exceptions', () => {
  const c = (e) => licenseCategory(parseSpdx(e).ast);
  assert.equal(c('MIT'), 'permissive'); assert.equal(c('CC0-1.0'), 'public-domain'); assert.equal(c('MPL-2.0'), 'weak-copyleft');
  assert.equal(c('GPL-3.0-or-later'), 'strong-copyleft'); assert.equal(c('AGPL-3.0-only'), 'network-copyleft'); assert.equal(c('SSPL-1.0'), 'network-copyleft');
  assert.equal(c('BUSL-1.1'), 'proprietary'); assert.equal(c('Foo-1.0'), 'unknown');
  assert.equal(c('GPL-2.0-only WITH Classpath-exception-2.0'), 'weak-copyleft');
});
test('license text heuristics', () => {
  const expect = { MIT: 'MIT', ISC: 'ISC', '0BSD': '0BSD', 'BSD-3-Clause': 'BSD-3-Clause', 'BSD-2-Clause': 'BSD-2-Clause', 'Apache-2.0': 'Apache-2.0', 'GPL-3.0': 'GPL-3.0-or-later', 'GPL-2.0': 'GPL-2.0-or-later', 'LGPL-2.1': 'LGPL-2.1-or-later', 'AGPL-3.0': 'AGPL-3.0-or-later', 'MPL-2.0': 'MPL-2.0', Unlicense: 'Unlicense', 'BSL-1.0': 'BSL-1.0' };
  for (const [k, v] of Object.entries(expect)) assert.equal(detectLicenseText(TEXTS[k]), v, k);
  assert.equal(detectLicenseText('All rights reserved.'), null);
});

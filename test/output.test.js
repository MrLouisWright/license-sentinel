import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, toCycloneDX, toSPDX, toNotices, formatText, formatJson, formatSarif, formatMarkdown } from '../src/index.js';
import { mixedProject } from './helpers.js';

const r = audit(mixedProject(), { now: '2026-10-13T12:00:00Z', includeDev: true });

test('CycloneDX 1.5 SBOM', () => {
  const b = JSON.parse(toCycloneDX(r, { toolVersion: '1.0.0' }));
  assert.equal(b.bomFormat, 'CycloneDX'); assert.equal(b.specVersion, '1.5'); assert.match(b.serialNumber, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(b.metadata.component.name, 'mixed-app'); assert.deepEqual(b.metadata.component.licenses, [{ license: { id: 'MIT' } }]);
  const c = (n) => b.components.find((x) => x.name === n);
  assert.equal(c('@acme/thing').purl, 'pkg:npm/%40acme/thing@1.0.0');
  assert.deepEqual(c('dual').licenses, [{ expression: 'MIT OR GPL-3.0-or-later' }]);
  assert.deepEqual(c('proprietary').licenses, [{ license: { name: 'UNLICENSED' } }]);
  assert.equal(c('nolicense').licenses, undefined);
  assert.equal(c('dev-gpl').scope, 'excluded'); assert.equal(c('mit-lib').scope, 'required');
  const refs = new Set(b.components.map((x) => x['bom-ref']));
  assert.equal(refs.size, b.components.length);
  for (const d of b.dependencies) for (const x of d.dependsOn) assert.ok(refs.has(x), x);
  assert.ok(b.dependencies.find((d) => d.ref === c('mit-lib')['bom-ref']).dependsOn.includes('pkg:npm/nested-isc@1.1.0'));
  assert.ok(!b.dependencies[0].dependsOn.includes('pkg:npm/nested-isc@1.1.0'), 'transitive not at top');
  const r1 = toCycloneDX(r, { reproducible: true }), r2 = toCycloneDX(r, { reproducible: true });
  assert.equal(JSON.parse(r1).serialNumber, JSON.parse(r2).serialNumber);
});
test('SPDX 2.3 SBOM', () => {
  const s = JSON.parse(toSPDX(r, { toolVersion: '1.0.0' }));
  assert.equal(s.spdxVersion, 'SPDX-2.3'); assert.equal(s.dataLicense, 'CC0-1.0'); assert.equal(s.SPDXID, 'SPDXRef-DOCUMENT');
  assert.match(s.creationInfo.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const ids = new Set(s.packages.map((p) => p.SPDXID));
  assert.equal(ids.size, s.packages.length);
  for (const p of s.packages) assert.match(p.SPDXID, /^SPDXRef-[A-Za-z0-9.-]+$/);
  for (const rel of s.relationships) { assert.ok(rel.spdxElementId === 'SPDXRef-DOCUMENT' || ids.has(rel.spdxElementId)); assert.ok(ids.has(rel.relatedSpdxElement)); }
  const p = (n) => s.packages.find((x) => x.name === n);
  assert.equal(p('dual').licenseDeclared, 'MIT OR GPL-3.0-or-later'); assert.equal(p('dual').licenseConcluded, 'MIT');
  assert.equal(p('nolicense').licenseConcluded, 'NOASSERTION');
  assert.equal(p('proprietary').licenseConcluded, 'LicenseRef-UNLICENSED');
  assert.ok(s.hasExtractedLicensingInfos.some((x) => x.licenseId === 'LicenseRef-UNLICENSED'));
  assert.equal(p('textonly').licenseDeclared, 'NOASSERTION'); assert.equal(p('textonly').licenseConcluded, 'Apache-2.0');
  assert.equal(p('@acme/thing').externalRefs[0].referenceLocator, 'pkg:npm/%40acme/thing@1.0.0');
});
test('NOTICES file: prod only by default, license texts, copyright and NOTICE', () => {
  const n = toNotices(r);
  assert.match(n, /THIRD-PARTY SOFTWARE NOTICES/);
  assert.match(n, /mit-lib@1\.0\.0\nLicense: MIT/);
  assert.match(n, /Copyright \(c\) 2024 Jane Doe/);
  assert.match(n, /NOTICE:\ntextonly\nCopyright 2020 Apache Folks/);
  assert.match(n, /dual@1\.0\.0\nLicense: MIT OR GPL-3\.0-or-later \(used under MIT\)/);
  assert.doesNotMatch(n, /dev-gpl/);
  assert.match(toNotices(r, { includeDev: true }), /dev-gpl/);
});
test('text, JSON, SARIF and Markdown reports', () => {
  const t = formatText(r, { failOn: 'high', verbose: true });
  assert.match(t, /mixed-app@2\.0\.0 \(MIT, permissive\)/); assert.match(t, /CRITICAL agpl-lib@1\.0\.0/); assert.match(t, /↳ fix:/); assert.match(t, /Failing/);
  const j = JSON.parse(formatJson(r));
  assert.equal(j.packages[0].licenseText, undefined); assert.ok(j.summary.byLicense.MIT >= 1);
  const s = JSON.parse(formatSarif(r, { version: '1.0.0' }));
  assert.equal(s.version, '2.1.0');
  for (const x of s.runs[0].results) assert.equal(s.runs[0].tool.driver.rules[x.ruleIndex].id, x.ruleId);
  const m = formatMarkdown(r, { failOn: 'critical' });
  assert.match(m, /❌ Failing/); assert.match(m, /\| License \| Packages \|/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, formatCsv, formatAttributionHtml, formatAttributionMarkdown, renderTemplate } from '../src/index.js';
import { mixedProject } from './helpers.js';

const r = audit(mixedProject(), { now: '2026-10-13T12:00:00Z' });

test('CSV and attribution templates', () => {
  const csv = formatCsv(r);
  assert.match(csv, /^name,version,license/);
  assert.match(csv, /mit-lib,1\.0\.0,MIT/);
  assert.doesNotMatch(csv, /dev-gpl/);
  const md = formatAttributionMarkdown(r);
  assert.match(md, /\| mit-lib \| 1\.0\.0 \| MIT \|/);
  const html = formatAttributionHtml(r, { title: 'Credits' });
  assert.match(html, /<title>Credits<\/title>/);
  assert.match(html, /<td>mit-lib<\/td>/);
});

test('custom template placeholders', () => {
  const tpl = '{{project.name}}\n{{#packages}}{{name}}@{{version}}={{license}}\n{{/packages}}';
  const out = renderTemplate(tpl, r);
  assert.match(out, /^mixed-app/);
  assert.match(out, /mit-lib@1\.0\.0=MIT/);
});

test('overrides require reason and replace license', () => {
  const rep = audit(mixedProject(), { now: '2026-10-13T12:00:00Z', overrides: [{ package: 'nolicense', license: 'MIT', reason: 'confirmed with upstream' }] });
  assert.equal(rep.packages.find((p) => p.name === 'nolicense').license, 'MIT');
  assert.equal(rep.findings.some((f) => f.package === 'nolicense' && f.rule === 'missing-license'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { audit, toCycloneDX } from '../src/index.js';
import { mixedProject } from './helpers.js';

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '../src/schemas');

function compileCycloneDxValidator() {
  const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
  addFormats(ajv);
  for (const f of ['spdx.schema.json', 'jsf-0.82.schema.json', 'bom-1.6.schema.json']) {
    ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, f), 'utf8')));
  }
  return ajv.getSchema('http://cyclonedx.org/schema/bom-1.6.schema.json');
}

const validate = compileCycloneDxValidator();

test('CycloneDX 1.6 SBOM validates against the official schema', () => {
  const r = audit(mixedProject(), { now: '2026-10-13T12:00:00Z', includeDev: true });
  const bom = JSON.parse(toCycloneDX(r, { toolVersion: '1.1.0', reproducible: true }));
  assert.equal(bom.specVersion, '1.6');
  assert.equal(bom.$schema, 'http://cyclonedx.org/schema/bom-1.6.schema.json');
  const ok = validate(bom);
  if (!ok) assert.fail(JSON.stringify(validate.errors?.slice(0, 8), null, 2));
});

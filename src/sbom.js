import { randomUUID, createHash } from 'node:crypto';
import { KNOWN } from './spdx.js';

const purl = (name, version) => `pkg:npm/${name.startsWith('@') ? '%40' + name.slice(1) : name}@${encodeURIComponent(version)}`;
const isSingleId = (e) => e && !/\s(AND|OR|WITH)\s/.test(e);
const known = (id) => !!KNOWN[String(id).toLowerCase()] && id !== 'UNLICENSED' && !id.startsWith('LicenseRef-');

function hashes(integrity) {
  if (!integrity) return undefined;
  const out = [];
  for (const part of String(integrity).split(/\s+/)) {
    const m = part.match(/^(sha512|sha384|sha256|sha1)-(.+)$/);
    if (m) out.push({ alg: { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256', sha1: 'SHA-1' }[m[1]], content: Buffer.from(m[2], 'base64').toString('hex') });
  }
  return out.length ? out : undefined;
}

function deterministicUuid(seed) {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** CycloneDX 1.5 JSON */
export function toCycloneDX(report, { toolVersion = '0.0.0', reproducible = false } = {}) {
  const rootRef = purl(report.project.name || 'project', report.project.version || '0.0.0');
  const lic = (e) => {
    if (!e) return undefined;
    if (isSingleId(e) && known(e)) return [{ license: { id: e } }];
    if (isSingleId(e)) return [{ license: { name: e } }];
    return [{ expression: e }];
  };
  const components = report.packages.map((p) => ({
    type: 'library', 'bom-ref': purl(p.name, p.version), name: p.name, version: p.version,
    ...(p.description ? { description: p.description } : {}),
    ...(p.author ? { author: p.author } : {}),
    scope: p.dev ? 'excluded' : 'required',
    ...(lic(p.license) ? { licenses: lic(p.license) } : {}),
    purl: purl(p.name, p.version),
    ...(hashes(p.integrity) ? { hashes: hashes(p.integrity) } : {}),
    ...(p.resolved || p.homepage || p.repository ? { externalReferences: [p.resolved && { type: 'distribution', url: p.resolved }, p.homepage && { type: 'website', url: p.homepage }, p.repository && { type: 'vcs', url: p.repository }].filter(Boolean) } : {}),
    properties: [{ name: 'license-sentinel:category', value: p.category }, ...(p.licenseSource ? [{ name: 'license-sentinel:license-source', value: p.licenseSource }] : []), ...(p.dev ? [{ name: 'cdx:npm:package:development', value: 'true' }] : [])],
  }));
  const refs = new Map(report.packages.map((p) => [p.ref || `${p.name}@${p.version}`, purl(p.name, p.version)]));
  const top = report.packages.filter((p) => !report.packages.some((q) => (q.dependencies || []).includes(p.ref)));
  const dependencies = [
    { ref: rootRef, dependsOn: top.map((p) => purl(p.name, p.version)) },
    ...report.packages.map((p) => ({ ref: purl(p.name, p.version), dependsOn: (p.dependencies || []).map((d) => refs.get(d)).filter(Boolean) })),
  ];
  return JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.5',
    serialNumber: `urn:uuid:${reproducible ? deterministicUuid(JSON.stringify(components)) : randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: report.generatedAt,
      tools: { components: [{ type: 'application', name: 'license-sentinel', version: toolVersion, author: 'Louis Wright' }] },
      component: { type: 'application', 'bom-ref': rootRef, name: report.project.name || 'project', version: report.project.version || '0.0.0', ...(lic(report.project.license) ? { licenses: lic(report.project.license) } : {}), purl: rootRef },
    },
    components, dependencies,
  }, null, 2) + '\n';
}

const spdxId = (s) => 'SPDXRef-' + s.replace(/[^A-Za-z0-9.-]/g, '-');
function spdxLicense(e) {
  if (!e) return 'NOASSERTION';
  if (e === 'UNLICENSED') return 'LicenseRef-UNLICENSED';
  return e.replace(/\b([A-Za-z0-9.+-]+)\b/g, (m) => m);
}

/** SPDX 2.3 JSON */
export function toSPDX(report, { toolVersion = '0.0.0', reproducible = false } = {}) {
  const rootName = report.project.name || 'project';
  const rootId = spdxId(`Package-${rootName}`);
  const extracted = new Map();
  const lic = (e) => {
    const l = spdxLicense(e);
    for (const m of l.matchAll(/LicenseRef-[A-Za-z0-9.-]+/g)) if (!extracted.has(m[0])) extracted.set(m[0], { licenseId: m[0], extractedText: m[0] === 'LicenseRef-UNLICENSED' ? 'UNLICENSED: no license granted by the author.' : `${m[0]} (see package license file)`, name: m[0].slice(11) });
    return l;
  };
  const packages = [{ name: rootName, SPDXID: rootId, versionInfo: report.project.version || 'NOASSERTION', downloadLocation: 'NOASSERTION', filesAnalyzed: false, licenseConcluded: lic(report.project.license), licenseDeclared: lic(report.project.license), copyrightText: 'NOASSERTION', primaryPackagePurpose: 'APPLICATION' }];
  const ids = new Map();
  for (const p of report.packages) {
    const id = spdxId(`Package-${p.name}-${p.version}`);
    ids.set(p.ref || `${p.name}@${p.version}`, id);
    packages.push({
      name: p.name, SPDXID: id, versionInfo: p.version, downloadLocation: p.resolved || 'NOASSERTION', filesAnalyzed: false,
      licenseConcluded: lic(p.chosen && p.chosen !== p.license ? p.chosen : p.license), licenseDeclared: p.declared ? lic(p.license) : 'NOASSERTION',
      copyrightText: p.copyright?.length ? p.copyright.join('\n') : 'NOASSERTION',
      ...(p.homepage ? { homepage: p.homepage } : {}), ...(p.description ? { summary: p.description } : {}),
      ...(p.integrity && /^sha512-/.test(p.integrity) ? { checksums: [{ algorithm: 'SHA512', checksumValue: Buffer.from(p.integrity.slice(7), 'base64').toString('hex') }] } : {}),
      externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: purl(p.name, p.version) }],
      ...(p.licenseSource ? { sourceInfo: `license from ${p.licenseSource}` } : {}),
    });
  }
  const relationships = [{ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: rootId }];
  const isChild = new Set(report.packages.flatMap((p) => p.dependencies || []));
  for (const p of report.packages) {
    const id = ids.get(p.ref || `${p.name}@${p.version}`);
    if (!isChild.has(p.ref)) relationships.push({ spdxElementId: rootId, relationshipType: 'DEPENDS_ON', relatedSpdxElement: id, ...(p.dev ? { comment: 'development dependency' } : {}) });
    for (const d of p.dependencies || []) if (ids.has(d)) relationships.push({ spdxElementId: id, relationshipType: 'DEPENDS_ON', relatedSpdxElement: ids.get(d) });
  }
  const body = { packages, relationships };
  const ns = reproducible ? deterministicUuid(JSON.stringify(body)) : randomUUID();
  return JSON.stringify({
    spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT', name: `${rootName}-sbom`,
    documentNamespace: `https://github.com/MrLouisWright/license-sentinel/spdx/${encodeURIComponent(rootName)}-${ns}`,
    creationInfo: { created: report.generatedAt.replace(/\.\d+Z$/, 'Z'), creators: [`Tool: license-sentinel-${toolVersion}`] },
    ...(extracted.size ? { hasExtractedLicensingInfos: [...extracted.values()] } : {}),
    ...body,
  }, null, 2) + '\n';
}

/** Third-party NOTICES / attribution file (production dependencies unless includeDev). */
export function toNotices(report, { includeDev = false } = {}) {
  const pk = report.packages.filter((p) => includeDev || !p.dev);
  const out = [`THIRD-PARTY SOFTWARE NOTICES AND INFORMATION`, ``, `${report.project.name || 'This project'} includes the following third-party packages.`, `Generated by license-sentinel on ${report.generatedAt.slice(0, 10)}.`, ''];
  out.push('Summary', '-------');
  for (const p of pk) out.push(`- ${p.name}@${p.version} — ${p.license || 'UNKNOWN'}`);
  out.push('');
  for (const p of pk) {
    out.push('='.repeat(78), `${p.name}@${p.version}`, `License: ${p.license || 'UNKNOWN'}${p.chosen && p.chosen !== p.license ? ` (used under ${p.chosen})` : ''}`);
    if (p.homepage || p.repository) out.push(`Source: ${p.homepage || p.repository}`);
    if (!p.licenseText) for (const c of p.copyright || []) out.push(c);
    out.push('');
    if (p.licenseText) out.push(p.licenseText.trim(), '');
    else out.push(`(No license text shipped with the package; see https://spdx.org/licenses/${encodeURIComponent((p.license || '').split(' ')[0])}.html)`, '');
    if (p.noticeText) out.push('NOTICE:', p.noticeText.trim(), '');
  }
  return out.join('\n') + '\n';
}

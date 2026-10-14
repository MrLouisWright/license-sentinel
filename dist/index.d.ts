export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'public-domain' | 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'network-copyleft' | 'proprietary' | 'unknown';
export type Preset = 'permissive' | 'weak-copyleft' | 'strong-copyleft';

export interface Exception { package: string; reason: string; license?: string; rules?: string[]; expires?: string; version?: string }
export interface LicenseOverride { package: string; reason: string; license: string; rules?: string[]; expires?: string; version?: string }
export interface Config {
  preset?: Preset; allow?: string[]; deny?: string[]; exceptions?: Exception[]; overrides?: LicenseOverride[];
  severity?: Record<string, Severity | 'off'>; projectLicense?: string; includeDev?: boolean; includePrivate?: boolean;
  source?: 'auto' | 'node_modules' | 'lockfile' | string; ignore?: string[]; failOn?: Severity | 'none';
  registry?: boolean | string; now?: string | number; installRoot?: string; importer?: string;
}
export interface WorkspaceAudit {
  workspace: { name: string; version?: string; relativePath: string; dir: string; private?: boolean };
  report: Report;
}
export interface MonorepoReport {
  tool: 'license-sentinel'; mode: 'monorepo' | 'single'; installRoot: string; workspaces: WorkspaceAudit[]; generatedAt: string;
}
export interface Finding { rule: string; severity: Severity; package: string; version: string; license: string | null; dev: boolean; message: string; fix: string }
export interface PackageResult {
  name: string; version: string; ref: string; dev: boolean; extraneous?: boolean;
  license: string | null; declared: string | null; detected: string | null; licenseSource: string | null;
  chosen: string | null; category: Category; path?: string; resolved?: string; integrity?: string;
  author?: string; homepage?: string; repository?: string; description?: string; dependencies: string[];
  copyright: string[]; licenseText?: string; noticeText?: string;
}
export interface Report {
  tool: 'license-sentinel'; generatedAt: string;
  project: { name?: string; version?: string; license: string | null; category: Category | null; dir: string; source: string; lockfile?: string };
  policy: { preset: Preset | null; allow: string[]; deny: string[]; includeDev: boolean };
  summary: { packages: number; prod: number; dev: number; byCategory: Record<string, number>; byLicense: Record<string, number> };
  packages: PackageResult[]; findings: Finding[]; suppressed: Array<Finding & { exception: { reason: string; expires?: string } }>;
  counts: Record<Severity, number>; registryErrors?: Array<{ package: string; error: string }>;
}
export interface SpdxLeaf { license: string; exception?: string; known: boolean }
export type SpdxNode = SpdxLeaf | { op: 'AND' | 'OR'; left: SpdxNode; right: SpdxNode };

export class ConfigError extends Error {}
export const RULES: Record<string, { severity: Severity; title: string }>;
export const SEVERITIES: Severity[];
export const CATEGORIES: Category[];
export const PRESETS: Record<Preset, Category[]>;
export function validateConfig(config: Config): Config;
export function audit(dir: string, config?: Config): Report;
export function auditWorkspaces(rootDir: string, config?: Config): MonorepoReport;
export function auditAsync(dir: string, config?: Config, opts?: { fetchImpl?: typeof fetch; token?: string }): Promise<Report>;
export function discoverWorkspaces(rootDir: string): Array<{ dir: string; relativePath: string; name: string; version?: string; private?: boolean }>;
export function findInstallRoot(dir: string): string;
export function auditCollected(collected: any, config?: Config): Report;
export function collectProject(dir: string, opts?: { source?: string }): any;
export function enrichFromRegistry(collected: any, opts?: { registry?: string; concurrency?: number; timeout?: number; token?: string; fetchImpl?: typeof fetch }): Promise<{ fetched: number; errors: Array<{ package: string; error: string }> }>;
export function exceeds(report: Report, failOn?: Severity | 'none'): boolean;
export function parseSpdx(expr: string): { ast: SpdxNode; warnings: string[] };
export function stringifySpdx(ast: SpdxNode): string;
export function spdxOptions(ast: SpdxNode): SpdxLeaf[][];
export function licenseCategory(leaf: SpdxLeaf): Category;
export function normaliseId(id: string): { id: string; known: boolean; changed: boolean; invalid?: boolean };
export function detectLicenseText(text: string): string | null;
export function entryMatches(entry: string, leaf: SpdxLeaf): boolean;
export function parseYaml(text: string): any;
export function formatText(r: Report, o?: { color?: boolean; failOn?: string; verbose?: boolean }): string;
export function formatJson(r: Report): string;
export function formatSarif(r: Report, o?: { version?: string; manifest?: string }): string;
export function formatMarkdown(r: Report, o?: { failOn?: string }): string;
export function formatCsv(r: Report, o?: { includeDev?: boolean }): string;
export function formatAttributionMarkdown(r: Report, o?: { title?: string; includeDev?: boolean }): string;
export function formatAttributionHtml(r: Report, o?: { title?: string; includeDev?: boolean }): string;
export function renderTemplate(template: string, r: Report, o?: { includeDev?: boolean }): string;
export function toCycloneDX(r: Report, o?: { toolVersion?: string; reproducible?: boolean; specVersion?: string }): string;
export function toSPDX(r: Report, o?: { toolVersion?: string; reproducible?: boolean }): string;
export function toNotices(r: Report, o?: { includeDev?: boolean }): string;

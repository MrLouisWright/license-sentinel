# Changelog

## 1.1.0 (2026-10-14)

- **CycloneDX 1.6** SBOM output (default `--cyclonedx`), with official JSON schemas bundled under `src/schemas/` and CI validation via Ajv.
- **Monorepo / workspace support:** `--workspaces` audits each npm/pnpm/yarn workspace package with hoisted `node_modules`; `--workspace-report-dir` writes one JSON report per package. Collection accepts `installRoot` / pnpm importer paths for workspace packages.
- **Production-only parity:** `--omit=dev` (npm-style) alongside `--prod` / `--include-dev` (default: production dependencies only).
- **Output templates:** built-in CSV inventory, Markdown attribution table, HTML attribution page, and `--template` / `--template-out` for simple `{{placeholders}}` and `{{#packages}}…{{/packages}}` blocks.
- **Per-package license overrides:** `overrides` in config (package + `license` + required `reason`) merge into policy exceptions and replace detected licenses.
- **Dual ESM + CJS** build (`dist/index.js` / `dist/index.cjs`) with `require`/`import` tests; TypeScript declarations emitted to `dist/index.d.ts` on build.
- README badges, CI build step, and existing release workflow with `npm publish --provenance`.

## 1.0.0 (2026-10-13)

First release, by Louis Wright.

- Dependency collection from `node_modules` (npm/yarn/pnpm layouts) and `package-lock.json`/`npm-shrinkwrap.json` (v1–v3), `pnpm-lock.yaml` (v5/v6/v9) and `yarn.lock` (v1 and Berry), including transitive dependencies with production/development classification.
- License resolution from `license`, legacy `license.type`/`licenses[]`, `SEE LICENSE IN`, lockfile fields and LICENSE/COPYING text heuristics; optional npm registry lookup for lockfile-only scans.
- SPDX expression parser (AND/OR/WITH, parentheses) with normalisation of deprecated ids and common aliases; OR chooses any allowed option.
- Policy: allow/deny lists with globs and categories, presets (permissive, weak-copyleft, strong-copyleft), compatibility check against the project license, per-package exceptions with reason, expiry, license override and rule scope, and per-rule severity.
- Rules: incompatible-license, denied-license, not-allowed, unlicensed, missing-license, unknown-license, unresolved-license, unclassified-license, invalid-spdx, license-mismatch, exception-expired, exception-unused.
- CycloneDX 1.5 and SPDX 2.3 JSON SBOMs, third-party NOTICES file, text/JSON/SARIF/Markdown reports, `--fail-on`, exit codes 0/1/2.
- Composite GitHub Action with job summary.

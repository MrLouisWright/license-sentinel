# Changelog

## 1.0.0 (2026-10-13)

First release, by Louis Wright.

- Dependency collection from `node_modules` (npm/yarn/pnpm layouts) and `package-lock.json`/`npm-shrinkwrap.json` (v1–v3), `pnpm-lock.yaml` (v5/v6/v9) and `yarn.lock` (v1 and Berry), including transitive dependencies with production/development classification.
- License resolution from `license`, legacy `license.type`/`licenses[]`, `SEE LICENSE IN`, lockfile fields and LICENSE/COPYING text heuristics; optional npm registry lookup for lockfile-only scans.
- SPDX expression parser (AND/OR/WITH, parentheses) with normalisation of deprecated ids and common aliases; OR chooses any allowed option.
- Policy: allow/deny lists with globs and categories, presets (permissive, weak-copyleft, strong-copyleft), compatibility check against the project license, per-package exceptions with reason, expiry, license override and rule scope, and per-rule severity.
- Rules: incompatible-license, denied-license, not-allowed, unlicensed, missing-license, unknown-license, unresolved-license, unclassified-license, invalid-spdx, license-mismatch, exception-expired, exception-unused.
- CycloneDX 1.5 and SPDX 2.3 JSON SBOMs, third-party NOTICES file, text/JSON/SARIF/Markdown reports, `--fail-on`, exit codes 0/1/2.
- Composite GitHub Action with job summary.

# license-sentinel

[![CI](https://github.com/MrLouisWright/license-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/license-sentinel/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/license-sentinel.svg)](https://www.npmjs.com/package/license-sentinel)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)

> A license compliance gate for npm projects, plus CycloneDX/SPDX SBOMs and a NOTICES file.

`license-sentinel` reads every installed dependency (from `node_modules` or the npm, pnpm and yarn lockfiles), works out each package's license from `package.json` and the LICENSE file text, parses SPDX expressions and checks the result against your policy and your project's own license. GPL in an MIT project, AGPL anywhere, `UNLICENSED`, missing and unrecognised licenses are reported with a severity and a **concrete fix**. The same run can write a **CycloneDX 1.6** SBOM (validated in CI against the [official schema](https://github.com/CycloneDX/specification)), an **SPDX 2.3** SBOM, CSV/HTML/Markdown attribution output, and a third-party **NOTICES** file.

CLI, library (`import` and `require`) and GitHub Action. Node.js 18+, **zero runtime dependencies**. Tests live under [`test/`](test/) and run on every push in [GitHub Actions](.github/workflows/ci.yml) (including CycloneDX schema validation and ESM/CJS smoke checks).

## Features

- **Dependency sources:** `node_modules` (npm, yarn and pnpm `.pnpm` layouts, nested and scoped packages, symlinks), `package-lock.json` / `npm-shrinkwrap.json` (v1–v3), `pnpm-lock.yaml` (v5, v6 and v9) and `yarn.lock` (v1 and Berry). Transitive dependencies are included. Production and development dependencies are told apart by walking the graph from your `dependencies` / `devDependencies`. Production only by default; add `--include-dev` for dev dependencies.
- **License resolution:** reads `license`, legacy `license: {type}` and `licenses: [...]`, `SEE LICENSE IN <file>` and lockfile license fields. When there is no usable field, it identifies the LICENSE/COPYING text: MIT, MIT-0, ISC, 0BSD, BSD-2/3/4-Clause, Apache-2.0, GPL/LGPL/AGPL, MPL-2.0, EPL, Unlicense, CC0, BSL-1.0, Zlib, BlueOak and more. For lockfile-only scans, `--registry` looks missing licenses up on the npm registry.
- **SPDX expressions:** `AND`, `OR`, `WITH` and parentheses, with `OR` choosing **any** allowed option (the least restrictive). Deprecated ids (`GPL-2.0+`, `GPL-3.0`) and common non-SPDX spellings (`Apache 2.0`, `MIT/Apache-2.0`, lowercase operators) are normalised and flagged. Linking exceptions such as `Classpath-exception-2.0` lower GPL to weak copyleft.
- **Policy:** allow and deny lists (SPDX ids, globs like `GPL-*`, or categories like `category:permissive`), the presets `permissive`, `weak-copyleft` and `strong-copyleft`, and a **category check against the project's own license**. Each per-package exception needs a reason and can have an expiry date, an overriding license or a rule scope. Per-rule severity can be changed or set to `off`.
- **Monorepos:** `--workspaces` runs a separate audit per workspace package (npm `workspaces`, `pnpm-workspace.yaml`); `--workspace-report-dir` writes one JSON file per package. Hoisted installs at the repo root are supported.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown reports; CycloneDX **1.6** JSON and SPDX 2.3 JSON SBOMs; CSV inventory; HTML and Markdown attribution pages; custom `--template` files; third-party NOTICES. `--fail-on` and exit codes 0/1/2.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `incompatible-license` | critical (network copyleft) / high (strong copyleft, proprietary) / low (weak copyleft) | Dependency category conflicts with the project license, e.g. GPL or AGPL in an MIT project. Dev-only deps are capped at low |
| `denied-license` | high | Every option of the expression contains a denied license |
| `not-allowed` | high | No option of the expression is fully on the allow list / preset |
| `unlicensed` | high | `"license": "UNLICENSED"`: no rights granted |
| `missing-license` | medium | No license field, no LICENSE file (or none in registry metadata) |
| `unknown-license` | medium | License text or field present but not recognisable; custom `LicenseRef-` |
| `unresolved-license` | medium | Lockfile-only scan with no license data (install `node_modules` or use `--registry`) |
| `exception-expired` | medium | A policy exception is past its `expires` date (the original finding comes back too) |
| `unclassified-license` | low | Valid id that isn't in the category table, so review it and allow/deny it explicitly |
| `invalid-spdx` | low | Non-SPDX or deprecated license string (normalised automatically) |
| `license-mismatch` | low | `package.json` says one license and the LICENSE file says another |
| `exception-unused` | info | Exception that matched no package |

### Categories and compatibility

`public-domain` < `permissive` < `weak-copyleft` < `strong-copyleft` < `network-copyleft` < `proprietary`. The project's category comes from its own `license` (or LICENSE file, or `--project-license`). For an MIT/ISC/Apache project: weak copyleft (LGPL, MPL, EPL) → low, strong copyleft (GPL) → high, network copyleft (AGPL, SSPL) → critical, proprietary/non-commercial → high. A GPL project may use GPL; AGPL is reported as medium. Use `--project-license UNLICENSED` for closed-source products.

## Install and run

```bash
npx license-sentinel                                  # audit the current project (production deps)
npx license-sentinel --preset permissive --fail-on medium
npx license-sentinel --deny "GPL-*,AGPL-*,SSPL-1.0" --include-dev
npx license-sentinel --source lockfile --registry      # no node_modules: use the lockfile + npm registry
npx license-sentinel --cyclonedx bom.cdx.json --spdx bom.spdx.json --notices THIRD_PARTY_NOTICES.txt
npx license-sentinel --omit=dev --csv licenses.csv --html attribution.html
npx license-sentinel --workspaces --workspace-report-dir reports/
```

### Sample output

On Louis Wright's own [`workflow-sentinel`](https://github.com/MrLouisWright/workflow-sentinel):

```text
license-sentinel — workflow-sentinel@1.0.0 (MIT, permissive)
1 package(s) from node_modules: 1 prod, 0 dev · preset permissive
Licenses: ISC ×1

  yaml@2.9.1                               ISC                          permissive

no findings
✔ Passing (fail-on: low).
```

On a test project with a mix of licenses (`--deny "AGPL-*"`):

```text
license-sentinel — mixed-app@2.0.0 (MIT, permissive)
16 package(s) from node_modules: 16 prod, 0 dev
Licenses: Apache-2.0 ×2, MIT ×2, ISC ×2, (unknown) ×2, BSD-2-Clause ×1, AGPL-3.0-only ×1, GPL-2.0-only WITH Classpath-exception-2.0 ×1, MIT OR GPL-3.0-or-later ×1, GPL-3.0-only ×1, MIT OR Apache-2.0 ×1, LGPL-2.1-or-later ×1, UNLICENSED ×1

HIGH     agpl-lib@1.0.0 is licensed AGPL-3.0-only; AGPL-3.0-only is denied by policy [denied-license]
         ↳ fix: Replace the package with a compatible alternative, or add a time-boxed exception with a reason.
HIGH     gpl-lib@1.0.0 is GPL-3.0-only (strong-copyleft) but the project is MIT (permissive) [incompatible-license]
         ↳ fix: Distributing GPL-3.0-only code with a permissive project makes the combined work subject to the GPL. Replace it, keep it out of what you ship, or relicense.
HIGH     proprietary@1.0.0 is UNLICENSED: no rights are granted to use, copy or distribute it [unlicensed]
         ↳ fix: Remove it, obtain a commercial license and record it as an exception, or ask the author to publish under an open-source license.
MEDIUM   nolicense@0.0.1 has no license: No license field and no LICENSE file [missing-license]
         ↳ fix: Without a license you have no right to redistribute it. Check the upstream repository; if it is licensed, add an exception with the confirmed license ({"package": "nolicense", "license": "MIT", "reason": "…"}), otherwise replace it.
MEDIUM   unknowntext@1.0.0: license could not be identified (LICENSE present but not recognised) [unknown-license]
         ↳ fix: Review the license text manually. Record the result as an exception with "license" set to the SPDX id, or replace the package.
LOW      aliased@1.0.0 declares "Apache 2.0" ("Apache 2.0" is not a valid SPDX expression; read as Apache-2.0) [invalid-spdx]
         ↳ fix: Treated as Apache-2.0. Ask upstream to use a valid SPDX expression.
LOW      classpath@1.0.0 is GPL-2.0-only WITH Classpath-exception-2.0 (weak-copyleft) but the project is MIT (permissive) [incompatible-license]
         ↳ fix: Weak copyleft is usually fine for unmodified dependencies; modifications to the library itself must be shared. Confirm you ship it unmodified.
LOW      lgpl-lib@1.0.0 is LGPL-2.1-or-later (weak-copyleft) but the project is MIT (permissive) [incompatible-license]
         ↳ fix: Weak copyleft is usually fine for unmodified dependencies; modifications to the library itself must be shared. Confirm you ship it unmodified.
LOW      mismatch@1.0.0 declares MIT but LICENSE looks like BSD-3-Clause [license-mismatch]
         ↳ fix: Check which license really applies; the LICENSE file normally wins legally. Record an exception once confirmed.

3 high, 2 medium, 4 low
✖ Failing (fail-on: high).
```

### Options

| Option | Description |
|---|---|
| `[dir]` | Project directory (default `.`) |
| `--source <s>` | `auto` (default: `node_modules` if present, else the lockfile), `node_modules`, `lockfile`, or a path to a lockfile |
| `--include-dev` / `--prod` / `--omit=dev` | Include devDependencies / production only (default) |
| `--workspaces` | Audit each workspace package in a monorepo |
| `--workspace-report-dir <dir>` | With `--workspaces`, write `<dir>/<workspace>.json` per package |
| `--registry`, `--registry-url <url>` | Look up licenses missing from lockfiles on the registry (token: `LICENSE_SENTINEL_REGISTRY_TOKEN`) |
| `--preset <p>` | `permissive`, `weak-copyleft` or `strong-copyleft` |
| `--allow <list>` / `--deny <list>` | Comma-separated or repeated: SPDX ids, globs (`GPL-*`), categories (`category:permissive`) |
| `--project-license <expr>` | Override the project's own license |
| `-c, --config <file>` | JSON config (default `.license-sentinel.json`, or `"licenseSentinel"` in package.json) |
| `-f, --format` | `text` (default), `json`, `sarif`, `markdown` |
| `--json/--sarif/--markdown <file>` | Also write that report to a file |
| `--cyclonedx <file>` / `--spdx <file>` | Write a CycloneDX 1.6 / SPDX 2.3 JSON SBOM |
| `--notices <file>` | Write a third-party NOTICES / attribution file (production deps unless `--include-dev`) |
| `--csv` / `--html` / `--attribution-md` | CSV inventory, HTML attribution page, Markdown table |
| `--template` / `--template-out` | Render a custom template (see below) |
| `--reproducible` | Deterministic SBOM serial number / document namespace |
| `--fail-on <sev>` | `critical`, `high` (default), `medium`, `low`, `info` or `none` |
| `--verbose` | List every package in text output |
| `--list-rules` | Rules and default severities |

**Exit codes:** `0` passed, `1` findings at or above `--fail-on`, `2` usage, configuration or read error.

## Configuration

`.license-sentinel.json` (or a `"licenseSentinel"` key in package.json):

```json
{
  "preset": "permissive",
  "allow": ["CC-BY-4.0", "Python-2.0"],
  "deny": ["AGPL-*", "SSPL-1.0", "category:proprietary"],
  "failOn": "medium",
  "includeDev": false,
  "severity": { "invalid-spdx": "off", "incompatible-license": "critical" },
  "ignore": ["@my-org/*"],
  "exceptions": [
    { "package": "some-gpl-tool", "reason": "CLI only, never bundled. Approved by legal 2026-09", "expires": "2027-03-31" },
    { "package": "old-lib@1.x", "license": "MIT", "reason": "No license field; MIT confirmed in upstream repo (issue #42)" },
    { "package": "fork-lib", "rules": ["license-mismatch"], "reason": "LICENSE text checked by hand" }
  ],
  "overrides": [
    { "package": "nolicense", "license": "MIT", "reason": "MIT confirmed in upstream README (ticket #99)" }
  ]
}
```

Each exception needs a `package` (name, glob or `name@range` with `1.x`, `^1` or an exact version) and a `reason`. With `license` it **replaces** the detected license and is still evaluated against the policy. Without one it **suppresses** the package's findings, optionally only those in `rules`. **`overrides`** are sugar for license replacements (same fields as an exception with `license`, always with a required `reason`). After `expires` it stops applying and an `exception-expired` finding is raised. Suppressed findings are listed under `suppressed` in the JSON report.

### Custom templates

Built-in `--csv`, `--html` and `--attribution-md` cover most attribution needs. For bespoke formats, pass a template file:

```text
{{project.name}} — generated {{generatedAt}}
{{#packages}}{{name}},{{version}},{{license}}
{{/packages}}
```

```bash
npx license-sentinel --template notices.tpl --template-out NOTICES.custom
```

Placeholders: `{{project.name}}`, `{{generatedAt}}`, `{{summary.packages}}`, and inside `{{#packages}}…{{/packages}}`: `{{name}}`, `{{version}}`, `{{license}}`, `{{category}}`, `{{path}}`.

## GitHub Action

```yaml
permissions:
  contents: read
jobs:
  licenses:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
        with: { persist-credentials: false }
      - run: npm ci --ignore-scripts
      - uses: MrLouisWright/license-sentinel@<sha> # v1
        with:
          preset: permissive
          deny: 'AGPL-*,SSPL-1.0'
          fail-on: medium
          cyclonedx: bom.cdx.json
          notices: THIRD_PARTY_NOTICES.txt
```

Inputs: `path`, `source`, `preset`, `allow`, `deny`, `include-dev`, `fail-on`, `config`, `sarif`, `json`, `cyclonedx`, `spdx`, `notices`, `job-summary`, `args`. The Markdown report goes to the job summary.

## Library

```js
import { audit, auditAsync, auditWorkspaces, toCycloneDX, toSPDX, toNotices, formatText, parseSpdx } from 'license-sentinel';
const { audit: auditCjs } = require('license-sentinel'); // dist/index.cjs after npm install

const report = audit('.', { preset: 'permissive', deny: ['AGPL-*'] });
console.log(formatText(report, { failOn: 'high' }));
fs.writeFileSync('bom.cdx.json', toCycloneDX(report));

const mono = auditWorkspaces('.', { includeDev: false });
const lockOnly = await auditAsync('.', { source: 'lockfile', registry: true });
```

## Limitations

This tool helps you find and manage license risk; it is not legal advice. Text detection uses heuristics for common licenses. Anything it cannot recognise is reported, never silently allowed.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## License

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const entry = join(root, 'src/index.js');
const shared = { entryPoints: [entry], bundle: true, platform: 'node', target: 'node18', sourcemap: true, legalComments: 'none' };

await esbuild.build({ ...shared, outfile: join(dist, 'index.js'), format: 'esm' });
await esbuild.build({ ...shared, outfile: join(dist, 'index.cjs'), format: 'cjs' });

cpSync(join(root, 'src/schemas'), join(dist, 'schemas'), { recursive: true });

cpSync(join(root, 'src/index.d.ts'), join(dist, 'index.d.ts'));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(dist, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log(`Built license-sentinel ${pkg.version} → dist/`);

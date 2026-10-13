import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const TEXTS = {
  MIT: 'MIT License\n\nCopyright (c) 2024 Jane Doe\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software ... The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.',
  ISC: 'ISC License\n\nCopyright (c) 2020, Someone\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.',
  '0BSD': 'Copyright (C) 2006 by Rob Landley\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.\n\nTHE SOFTWARE IS PROVIDED "AS IS"',
  'BSD-3-Clause': 'Copyright (c) 2019, ACME\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n3. Neither the name of the copyright holder nor the names of its contributors may be used',
  'BSD-2-Clause': 'Copyright (c) 2019, ACME\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n1. Redistributions of source code must retain',
  'Apache-2.0': '\n                                 Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/\n',
  'GPL-3.0': '                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007\n',
  'GPL-2.0': '                    GNU GENERAL PUBLIC LICENSE\n                       Version 2, June 1991\n',
  'LGPL-2.1': '                  GNU LESSER GENERAL PUBLIC LICENSE\n                       Version 2.1, February 1999\n',
  'AGPL-3.0': '                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007\n',
  'MPL-2.0': 'Mozilla Public License Version 2.0\n==================================\n',
  Unlicense: 'This is free and unencumbered software released into the public domain.\n',
  'BSL-1.0': 'Boost Software License - Version 1.0 - August 17th, 2003\n',
};

export function tmp(prefix = 'ls-') { return mkdtempSync(join(tmpdir(), prefix)); }

/** Create a project dir. pkgs: { 'node_modules/x': { pj: {...}, files: { LICENSE: '...' } } } */
export function makeProject(rootPj, pkgs = {}, extraFiles = {}) {
  const dir = tmp();
  writeFileSync(join(dir, 'package.json'), JSON.stringify(rootPj, null, 2));
  for (const [rel, { pj, files = {}, link }] of Object.entries(pkgs)) {
    const p = join(dir, rel);
    if (link) { mkdirSync(dirname(p), { recursive: true }); symlinkSync(join(dir, link), p, 'dir'); continue; }
    mkdirSync(p, { recursive: true });
    if (pj) writeFileSync(join(p, 'package.json'), JSON.stringify(pj));
    for (const [f, t] of Object.entries(files)) writeFileSync(join(p, f), t);
  }
  for (const [f, t] of Object.entries(extraFiles)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); }
  return dir;
}

/** The main node_modules fixture: an MIT app with a mix of licenses. */
export function mixedProject(rootOverrides = {}) {
  const deps = { 'mit-lib': '^1', 'gpl-lib': '^1', dual: '^1', 'agpl-lib': '^1', nolicense: '^1', textonly: '^1', proprietary: '^1', legacy: '^1', aliased: '^1', mismatch: '^1', 'lgpl-lib': '^1', seefile: '^1', classpath: '^1', '@acme/thing': '^1', unknowntext: '^1' };
  return makeProject({ name: 'mixed-app', version: '2.0.0', license: 'MIT', dependencies: deps, devDependencies: { 'dev-gpl': '^1' }, ...rootOverrides }, {
    'node_modules/mit-lib': { pj: { name: 'mit-lib', version: '1.0.0', license: 'MIT', dependencies: { 'nested-isc': '^1' }, homepage: 'https://example.com/mit-lib' }, files: { LICENSE: TEXTS.MIT } },
    'node_modules/mit-lib/node_modules/nested-isc': { pj: { name: 'nested-isc', version: '1.1.0', license: 'ISC' }, files: { 'LICENSE.md': TEXTS.ISC } },
    'node_modules/gpl-lib': { pj: { name: 'gpl-lib', version: '1.0.0', license: 'GPL-3.0-only' }, files: { COPYING: TEXTS['GPL-3.0'] } },
    'node_modules/dual': { pj: { name: 'dual', version: '1.0.0', license: '(MIT OR GPL-3.0-or-later)' } },
    'node_modules/agpl-lib': { pj: { name: 'agpl-lib', version: '1.0.0', license: 'AGPL-3.0-only' } },
    'node_modules/nolicense': { pj: { name: 'nolicense', version: '0.0.1' } },
    'node_modules/textonly': { pj: { name: 'textonly', version: '1.0.0' }, files: { 'LICENSE.txt': TEXTS['Apache-2.0'], NOTICE: 'textonly\nCopyright 2020 Apache Folks' } },
    'node_modules/proprietary': { pj: { name: 'proprietary', version: '1.0.0', license: 'UNLICENSED' } },
    'node_modules/legacy': { pj: { name: 'legacy', version: '1.0.0', licenses: [{ type: 'MIT', url: 'x' }, { type: 'Apache-2.0', url: 'y' }] } },
    'node_modules/aliased': { pj: { name: 'aliased', version: '1.0.0', license: 'Apache 2.0' } },
    'node_modules/mismatch': { pj: { name: 'mismatch', version: '1.0.0', license: 'MIT' }, files: { LICENSE: TEXTS['BSD-3-Clause'] } },
    'node_modules/lgpl-lib': { pj: { name: 'lgpl-lib', version: '1.0.0', license: 'LGPL-2.1-or-later' } },
    'node_modules/seefile': { pj: { name: 'seefile', version: '1.0.0', license: 'SEE LICENSE IN TERMS.txt' }, files: { 'TERMS.txt': TEXTS.ISC } },
    'node_modules/classpath': { pj: { name: 'classpath', version: '1.0.0', license: 'GPL-2.0-only WITH Classpath-exception-2.0' } },
    'node_modules/@acme/thing': { pj: { name: '@acme/thing', version: '1.0.0', license: 'BSD-2-Clause' }, files: { LICENSE: TEXTS['BSD-2-Clause'] } },
    'node_modules/unknowntext': { pj: { name: 'unknowntext', version: '1.0.0' }, files: { LICENSE: 'All rights reserved. Do not copy.' } },
    'node_modules/dev-gpl': { pj: { name: 'dev-gpl', version: '1.0.0', license: 'GPL-2.0-only' } },
  });
}

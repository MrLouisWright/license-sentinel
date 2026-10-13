// Identify a license from its text.
const has = (t, ...res) => res.every((r) => r.test(t));

export function detectLicenseText(text) {
  if (!text) return null;
  const t = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const v = (re) => re.test(t);
  if (v(/GNU AFFERO GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? 'AGPL-3.0-or-later' : 'AGPL-1.0-or-later';
  if (v(/GNU LESSER GENERAL PUBLIC LICENSE/i) || v(/GNU LIBRARY GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? 'LGPL-3.0-or-later' : v(/Version 2\.1/i) ? 'LGPL-2.1-or-later' : 'LGPL-2.0-or-later';
  if (v(/GNU GENERAL PUBLIC LICENSE/i)) return v(/Version 3/i) ? 'GPL-3.0-or-later' : v(/Version 2/i) ? 'GPL-2.0-or-later' : 'GPL-1.0-or-later';
  if (v(/Server Side Public License/i)) return 'SSPL-1.0';
  if (v(/Mozilla Public License,? Version 2\.0/i)) return 'MPL-2.0';
  if (v(/Eclipse Public License - v 2\.0/i)) return 'EPL-2.0';
  if (v(/Eclipse Public License - v 1\.0/i)) return 'EPL-1.0';
  if (v(/Apache License/i) && v(/Version 2\.0/i)) return 'Apache-2.0';
  if (v(/Business Source License/i)) return 'BUSL-1.1';
  if (v(/This is free and unencumbered software released into the public domain/i)) return 'Unlicense';
  if (v(/CC0 1\.0 Universal/i)) return 'CC0-1.0';
  if (v(/Blue ?Oak Model License/i)) return 'BlueOak-1.0.0';
  if (v(/Boost Software License/i)) return 'BSL-1.0';
  if (v(/DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i)) return 'WTFPL';
  if (v(/Attribution 4\.0 International/i) && !v(/NonCommercial|ShareAlike|NoDerivatives/i)) return 'CC-BY-4.0';
  if (v(/Permission is hereby granted, free of charge, to any person obtaining a copy/i)) {
    return v(/The above copyright notice and this permission notice shall be included/i) ? 'MIT' : 'MIT-0';
  }
  if (v(/Permission to use, copy, modify,? and(\/or)? distribute this software for any purpose with or without fee is hereby granted/i)) {
    return v(/provided that the above copyright notice and this permission notice appear in all copies/i) ? 'ISC' : '0BSD';
  }
  if (v(/Redistribution and use in source and binary forms, with or without modification, are permitted/i)) {
    if (v(/advertising materials/i)) return 'BSD-4-Clause';
    if (v(/Neither the name|The name of the author may not|names of (its|the) contributors may not/i)) return 'BSD-3-Clause';
    return 'BSD-2-Clause';
  }
  if (v(/This software is provided ['‘]as-is['’], without any express or implied warranty/i) && v(/altered source versions must be plainly marked/i)) return 'Zlib';
  if (v(/PYTHON SOFTWARE FOUNDATION LICENSE/i)) return 'Python-2.0';
  if (v(/SIL OPEN FONT LICENSE/i)) return 'OFL-1.1';
  if (v(/^\s*(The )?MIT License\s*$/im)) return 'MIT';
  if (v(/^\s*ISC License\s*$/im)) return 'ISC';
  return null;
}

/** Copyright lines from a license file (for NOTICES). */
export function copyrightLines(text) {
  if (!text) return [];
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(copyright\b|\(c\)|©)/i.test(l) && !/copyright (notice|holders?|owner)/i.test(l) && l.length < 200))].slice(0, 5);
}

export const LICENSE_FILE_RE = /^(un)?licen[cs]e([-._].*)?$|^copying([-._].*)?$|^notice([-._].*)?$/i;
export { has };

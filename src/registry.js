// Optional: fill in licenses for lockfile-only audits from the npm registry.
export async function enrichFromRegistry(collected, { registry = 'https://registry.npmjs.org', concurrency = 8, timeout = 15000, fetchImpl = globalThis.fetch, token } = {}) {
  const base = registry.replace(/\/+$/, '');
  const todo = collected.packages.filter((p) => p.licenseField == null && !p.licenseFiles?.length && !p.lockLicense && p.version);
  const errors = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++];
      const url = `${base}/${p.name.startsWith('@') ? '@' + encodeURIComponent(p.name.slice(1)) : encodeURIComponent(p.name)}/${encodeURIComponent(p.version)}`;
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetchImpl(url, { headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) { errors.push({ package: `${p.name}@${p.version}`, error: `HTTP ${res.status}` }); continue; }
        const m = await res.json();
        p.licenseField = m.license ?? null; p.licensesField = m.licenses ?? null;
        p.homepage ??= m.homepage; p.description ??= m.description;
        p.repository ??= typeof m.repository === 'string' ? m.repository : m.repository?.url;
        p.author ??= typeof m.author === 'string' ? m.author : m.author?.name;
        p.registryChecked = true;
      } catch (e) { errors.push({ package: `${p.name}@${p.version}`, error: e.name === 'AbortError' ? 'timeout' : e.message }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { fetched: todo.length - errors.length, errors };
}

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function bump(v) {
  
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v || '');
  if (!m) return 'v0.0.1';
  let [major, minor, patch] = m.slice(1).map(Number);
  patch += 1;
  if (patch > 99) { patch = 0; minor += 1; }
  if (minor > 99) { minor = 0; major += 1; }
  return `v${major}.${minor}.${patch}`;
}

try {
  const versionFile = join(root, 'src', 'lib', 'version.js');
  const cur = readFileSync(versionFile, 'utf8');
  const match = cur.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const next = bump(match ? match[1] : 'v0.0.1');
  writeFileSync(versionFile, `// Versão do site. Incrementada automaticamente a cada commit (ver .githooks/pre-commit).\nexport const APP_VERSION = '${next}';\n`);

  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = next.replace(/^v/, '');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  console.log('[bump-version] ->', next);
} catch (e) {
  console.warn('[bump-version] erro:', e.message);
  process.exit(0); 
}

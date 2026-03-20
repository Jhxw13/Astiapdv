/**
 * Recompila better-sqlite3 para a versão correta do Electron
 * Executado automaticamente pelo postinstall
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getElectronVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'node_modules', 'electron', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version;
    }
  } catch {}
  return null;
}

const electronVersion = getElectronVersion();

if (!electronVersion) {
  console.log('[rebuild] electron nao encontrado, pulando rebuild...');
  process.exit(0);
}

console.log(`[rebuild] Recompilando better-sqlite3 para Electron ${electronVersion}...`);

try {
  const cmd = `npx @electron/rebuild -f -w better-sqlite3 --version ${electronVersion}`;
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('[rebuild] better-sqlite3 compilado com sucesso!');
} catch (err) {
  console.log('[rebuild] Aviso: rebuild automatico falhou:', err.message);
  console.log('[rebuild] Execute manualmente: npx @electron/rebuild -f -w better-sqlite3');
}

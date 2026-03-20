/**
 * ASTIA PDV — Script de publicação de nova versão
 * 
 * Uso: node scripts/publicar-versao.js 1.0.1 "Correção de bugs no financeiro"
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const novaVersao = process.argv[2];
const notas      = process.argv[3] || 'Melhorias e correções de bugs';

if (!novaVersao) {
  console.error('Uso: node scripts/publicar-versao.js <versao> "<notas>"');
  console.error('Ex:  node scripts/publicar-versao.js 1.0.1 "Correção no financeiro"');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(novaVersao)) {
  console.error('Versão deve seguir o formato: MAJOR.MINOR.PATCH (ex: 1.0.1)');
  process.exit(1);
}

console.log(`\n🚀 Publicando ASTIA PDV v${novaVersao}...`);
console.log(`📋 Notas: ${notas}\n`);

// 1. Atualiza package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const versaoAtual = pkg.version;
pkg.version = novaVersao;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`✅ package.json: ${versaoAtual} → ${novaVersao}`);

// 2. Git commit e tag
try {
  execSync('git add package.json', { stdio: 'inherit' });
  execSync(`git commit -m "release: v${novaVersao} — ${notas}"`, { stdio: 'inherit' });
  execSync(`git tag -a v${novaVersao} -m "${notas}"`, { stdio: 'inherit' });
  console.log(`✅ Tag v${novaVersao} criada`);
} catch (e) {
  console.error('❌ Erro no Git:', e.message);
  process.exit(1);
}

// 3. Push para GitHub
try {
  execSync('git push', { stdio: 'inherit' });
  execSync('git push --tags', { stdio: 'inherit' });
  console.log(`✅ Push realizado`);
} catch (e) {
  console.error('❌ Erro no push:', e.message);
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║  ✅ ASTIA PDV v${novaVersao.padEnd(41)} ║
║                                                          ║
║  GitHub Actions está compilando o instalador (~10min)    ║
║  Repositório privado — clientes atualizam automaticamente║
╚══════════════════════════════════════════════════════════╝
`);

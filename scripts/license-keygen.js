/**
 * Gera chaves Ed25519 para licenciamento offline.
 * Uso:
 *   node scripts/license-keygen.js
 * Saída:
 *   scripts/license-private.pem
 *   scripts/license-public.pem
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const outDir = path.join(__dirname);
const privatePath = path.join(outDir, 'license-private.pem');
const publicPath = path.join(outDir, 'license-public.pem');

if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
  console.error('Arquivos de chave já existem. Apague antes de gerar novamente.');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

fs.writeFileSync(privatePath, privatePem, 'utf-8');
fs.writeFileSync(publicPath, publicPem, 'utf-8');

console.log('Chaves geradas com sucesso:');
console.log(`- Privada: ${privatePath}`);
console.log(`- Pública: ${publicPath}`);
console.log('\nPróximo passo:');
console.log('1) Guarde a chave privada em local seguro (fora do repositório).');
console.log('2) Defina LICENSE_PUBLIC_KEY_PEM no ambiente do app com o conteúdo de license-public.pem.');

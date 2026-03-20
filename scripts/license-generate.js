/**
 * Gera uma licença offline assinada (ASTIA1.<payload>.<assinatura>).
 *
 * Exemplo:
 * node scripts/license-generate.js ^
 *   --private scripts/license-private.pem ^
 *   --id CLI-0001 ^
 *   --customer "Loja Exemplo" ^
 *   --plan lifetime ^
 *   --device "ASTIA-ABC123"
 *
 * Para licença com vencimento:
 *   --expires 2026-12-31
 */
const fs = require('fs');
const crypto = require('crypto');

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

const privatePath = argValue('private');
const id = argValue('id') || `LIC-${Date.now()}`;
const customer = argValue('customer') || '';
const plan = (argValue('plan') || 'pro').toLowerCase();
const expires = argValue('expires');
const deviceId = argValue('device');
const notes = argValue('notes') || '';

if (!privatePath) {
  console.error('Informe --private <caminho da chave privada PEM>');
  process.exit(1);
}

if (!fs.existsSync(privatePath)) {
  console.error(`Chave privada não encontrada: ${privatePath}`);
  process.exit(1);
}

if (plan !== 'lifetime' && !expires) {
  console.error('Para planos não lifetime, informe --expires AAAA-MM-DD');
  process.exit(1);
}

const privatePem = fs.readFileSync(privatePath, 'utf-8');
const payload = {
  id,
  customer,
  plan,
  status: 'active',
  issuedAt: new Date().toISOString(),
  expiresAt: plan === 'lifetime' ? null : new Date(`${expires}T23:59:59`).toISOString(),
  deviceId: deviceId || null,
  notes,
};

const header = 'ASTIA1';
const payloadPart = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
const data = Buffer.from(`${header}.${payloadPart}`, 'utf-8');
const sig = crypto.sign(null, data, privatePem).toString('base64url');
const token = `${header}.${payloadPart}.${sig}`;

console.log('\n=== LICENÇA GERADA ===\n');
console.log(token);
console.log('\n======================\n');
console.log('Resumo:');
console.log(JSON.stringify(payload, null, 2));

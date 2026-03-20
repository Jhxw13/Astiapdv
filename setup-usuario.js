/**
 * VYN CRM — Script de setup de usuário
 * 
 * Uso:
 *   node setup-usuario.js                          → cria/reseta admin padrão
 *   node setup-usuario.js email senha cargo        → cria usuário customizado
 * 
 * Exemplos:
 *   node setup-usuario.js
 *   node setup-usuario.js joao@loja.com senha123 vendedor
 *   node setup-usuario.js gerente@loja.com senha456 gerente
 * 
 * Cargos disponíveis: admin, gerente, vendedor, caixa
 */

const path = require('path');
const os   = require('os');

// Localiza o banco no mesmo lugar que o Electron usaria
const appName = 'vyncrm';
let userData;
if (process.platform === 'win32') {
  userData = path.join(process.env.APPDATA || os.homedir(), appName);
} else if (process.platform === 'darwin') {
  userData = path.join(os.homedir(), 'Library', 'Application Support', appName);
} else {
  userData = path.join(os.homedir(), '.config', appName);
}

const dbPath = path.join(userData, 'vyncrm.db');
console.log(`\n📂 Banco de dados: ${dbPath}\n`);

let Database, bcrypt;
try {
  Database = require('better-sqlite3');
  bcrypt   = require('bcryptjs');
} catch (e) {
  console.error('❌ Dependências não instaladas. Rode: npm install');
  process.exit(1);
}

const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.error('❌ Banco não encontrado. Abra o VYN CRM pelo menos uma vez antes de usar este script.');
  process.exit(1);
}

const db = new Database(dbPath);

const args  = process.argv.slice(2);
const email = args[0] || 'admin@vyncrm.com';
const senha = args[1] || 'admin123';
const cargo = args[2] || 'admin';
const nome  = args[3] || (cargo === 'admin' ? 'Administrador' : email.split('@')[0]);

const cargosValidos = ['admin', 'gerente', 'vendedor', 'caixa'];
if (!cargosValidos.includes(cargo)) {
  console.error(`❌ Cargo inválido: "${cargo}". Use: ${cargosValidos.join(', ')}`);
  process.exit(1);
}

const hash   = bcrypt.hashSync(senha, 10);
const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

if (existe) {
  db.prepare('UPDATE usuarios SET senha_hash = ?, cargo = ?, ativo = 1, nome = ? WHERE email = ?')
    .run(hash, cargo, nome, email);
  console.log(`✅ Usuário atualizado com sucesso!`);
} else {
  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, cargo, ativo) VALUES (?, ?, ?, ?, 1)`)
    .run(nome, email, hash, cargo);
  console.log(`✅ Usuário criado com sucesso!`);
}

console.log(`\n   E-mail : ${email}`);
console.log(`   Senha  : ${senha}`);
console.log(`   Cargo  : ${cargo}`);
console.log(`   Nome   : ${nome}\n`);

db.close();

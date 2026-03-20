/**
 * VYN CRM - Módulo de banco de dados SQLite
 * src/main/db.js
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db = null;
const DEFAULT_ADMIN_EMAIL = 'admin@vyncrm.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

function initDB(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Migrations automáticas
  runMigrations();

  // Garante que o admin padrão existe
  ensureAdmin();

  console.log(`[DB] Inicializado: ${dbPath}`);
  return db;
}

function ensureAdmin() {
  const existe = db.prepare('SELECT id, senha_hash FROM usuarios WHERE email = ?').get(DEFAULT_ADMIN_EMAIL);
  if (!existe) {
    // Cria admin com hash correto
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, cargo, ativo) VALUES (?, ?, ?, 'admin', 1)`)
      .run('Administrador', DEFAULT_ADMIN_EMAIL, hash);
    console.log('[DB] Admin criado: admin@vyncrm.com / admin123');
  } else {
    // Garante que o hash está correto (corrige hashes inválidos de versões anteriores)
    const ok = bcrypt.compareSync(DEFAULT_ADMIN_PASSWORD, existe.senha_hash || '');
    if (!ok) {
      const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
      db.prepare('UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE email = ?')
        .run(hash, DEFAULT_ADMIN_EMAIL);
      console.log('[DB] Hash do admin corrigido.');
    }
  }
}

function runMigrations() {
  // Adiciona colunas novas sem quebrar instâncias antigas
  const safeAddColumn = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[DB] Migração: coluna ${table}.${col} adicionada`);
    }
  };

  // ── CORREÇÃO CRÍTICA: trigger com bug "5 values for 6 columns" ──────────────
  // O trigger antigo não incluía NEW.venda_id no SELECT — DROP e recria
  db.exec(`DROP TRIGGER IF EXISTS tr_atualiza_estoque_venda`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tr_atualiza_estoque_venda
    AFTER INSERT ON itens_venda
    FOR EACH ROW
    BEGIN
      INSERT INTO movimentacoes_estoque
        (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, venda_id)
      SELECT
        NEW.produto_id, 'saida', NEW.quantidade,
        estoque_atual, estoque_atual - NEW.quantidade, NEW.venda_id
      FROM produtos WHERE id = NEW.produto_id;

      UPDATE produtos
      SET estoque_atual = estoque_atual - NEW.quantidade,
          atualizado_em = datetime('now','localtime')
      WHERE id = NEW.produto_id;
    END
  `);
  console.log('[DB] Trigger tr_atualiza_estoque_venda corrigido.');

  // Adiciona coluna permitir_venda_sem_estoque se não existir
  safeAddColumn('produtos', 'permitir_venda_sem_estoque', 'INTEGER DEFAULT 1');
  safeAddColumn('creditos_cliente', 'voucher_codigo', 'TEXT');
  safeAddColumn('pedidos', 'prazo_entrega', "TEXT DEFAULT ''");
  safeAddColumn('pedidos', 'validade_dias', 'INTEGER DEFAULT 7');
  safeAddColumn('creditos_cliente', 'voucher_usado', 'INTEGER DEFAULT 0');
  // Validade e lucro nos produtos
  safeAddColumn('produtos', 'data_validade', 'TEXT');
  safeAddColumn('produtos', 'dias_validade_alerta', 'INTEGER DEFAULT 30');
  safeAddColumn('produtos', 'percentual_lucro', 'REAL DEFAULT 0');
  safeAddColumn('produtos', 'codigo_lote', 'TEXT');
  // Focus NF-e integration fields
  safeAddColumn('config_loja', 'focus_api_key', 'TEXT');
  safeAddColumn('config_loja', 'focus_nfe_habilitado', 'INTEGER DEFAULT 0');
  safeAddColumn('config_loja', 'serie_nfe', 'INTEGER DEFAULT 1');
  safeAddColumn('config_loja', 'ultimo_numero_nfe', 'INTEGER DEFAULT 0');
  safeAddColumn('config_loja', 'serie_nfce', 'INTEGER DEFAULT 1');
  safeAddColumn('config_loja', 'ultimo_numero_nfce', 'INTEGER DEFAULT 0');
  // Licenciamento
  safeAddColumn('config_loja', 'validade_licenca', 'TEXT');
  safeAddColumn('config_loja', 'license_status', "TEXT DEFAULT 'trial'");
  safeAddColumn('config_loja', 'license_activated_at', 'TEXT');
  safeAddColumn('config_loja', 'license_last_check', 'TEXT');
  safeAddColumn('config_loja', 'license_offline_grace_until', 'TEXT');
  safeAddColumn('config_loja', 'license_trial_started_at', 'TEXT');
  safeAddColumn('config_loja', 'license_device_id', 'TEXT');
  safeAddColumn('config_loja', 'license_customer_name', 'TEXT');
  safeAddColumn('config_loja', 'license_server_url', 'TEXT');
  safeAddColumn('config_loja', 'license_notes', 'TEXT');
  safeAddColumn('config_loja', 'onboarding_primeiro_acesso_concluido', 'INTEGER DEFAULT 0');
  // Garante início do trial para bases antigas
  getDB().prepare(`
    UPDATE config_loja
    SET license_trial_started_at = COALESCE(license_trial_started_at, datetime('now','localtime'))
    WHERE id = 1
  `).run();
  // Loja Online / E-commerce
  safeAddColumn('config_loja', 'ecommerce_ativo',        'INTEGER DEFAULT 0');
  safeAddColumn('config_loja', 'ecommerce_agendamento',  'INTEGER DEFAULT 0');
  safeAddColumn('config_loja', 'ecommerce_supabase_url', 'TEXT');
  safeAddColumn('config_loja', 'ecommerce_supabase_key', 'TEXT');
  safeAddColumn('config_loja', 'ecommerce_site_url',     'TEXT');
  safeAddColumn('config_loja', 'ecommerce_frete_tipo',   "TEXT DEFAULT 'retirada'");
  safeAddColumn('config_loja', 'ecommerce_frete_fixo',   'REAL DEFAULT 0');
  safeAddColumn('config_loja', 'ecommerce_bairros',      "TEXT DEFAULT '[]'");
  safeAddColumn('config_loja', 'ecommerce_pedido_minimo','REAL DEFAULT 0');
  safeAddColumn('config_loja', 'ecommerce_tempo_entrega','TEXT');
  safeAddColumn('config_loja', 'ecommerce_whatsapp',     'TEXT');
  safeAddColumn('config_loja', 'ecommerce_ultimo_sync',  'TEXT');
  // Marcar produto para loja online
  safeAddColumn('produtos', 'online_ativo',   'INTEGER DEFAULT 0');
  safeAddColumn('produtos', 'online_descricao','TEXT');
  safeAddColumn('produtos', 'online_foto_url', 'TEXT');
  safeAddColumn('produtos', 'online_destaque', 'INTEGER DEFAULT 0');
  // Preço promocional
  safeAddColumn('produtos', 'preco_promocional',        'REAL DEFAULT 0');
  safeAddColumn('produtos', 'promocao_ativa',           'INTEGER DEFAULT 0');
  // Gera voucher_codigo para créditos que não têm
  getDB().prepare(`UPDATE creditos_cliente SET voucher_codigo = 'VCH-' || id || '-' || substr(hex(randomblob(4)),1,6) WHERE voucher_codigo IS NULL`).run();

  // ── Fornecedores e Compras ──────────────────────────────────────────────────
  // Cria tabelas caso banco já exista sem elas (usuários que atualizarem)
  getDB().exec(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      tipo_pessoa TEXT DEFAULT 'J' CHECK(tipo_pessoa IN ('F','J')),
      cnpj TEXT, cpf TEXT, inscricao_estadual TEXT,
      email TEXT, telefone TEXT, celular TEXT,
      cep TEXT, logradouro TEXT, numero TEXT,
      complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
      contato_nome TEXT, prazo_pagamento INTEGER DEFAULT 30,
      observacoes TEXT, ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores(cnpj);
    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      fornecedor_id INTEGER REFERENCES fornecedores(id),
      usuario_id INTEGER REFERENCES usuarios(id),
      status TEXT DEFAULT 'recebida' CHECK(status IN ('pendente','recebida','cancelada')),
      numero_nf TEXT, data_emissao TEXT,
      data_recebimento TEXT DEFAULT (date('now','localtime')),
      subtotal REAL DEFAULT 0, desconto_valor REAL DEFAULT 0,
      frete REAL DEFAULT 0, outras_despesas REAL DEFAULT 0, total REAL DEFAULT 0,
      condicao_pagamento TEXT DEFAULT 'a_vista',
      forma_pagamento TEXT DEFAULT 'boleto',
      observacoes TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_compras_fornecedor ON compras(fornecedor_id);
    CREATE INDEX IF NOT EXISTS idx_compras_data ON compras(data_recebimento);
    CREATE TABLE IF NOT EXISTS itens_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      nome_produto TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL,
      total REAL NOT NULL
    );
  `);

  // ── Representantes e Comissões ─────────────────────────────────────────────
  getDB().exec(`
    CREATE TABLE IF NOT EXISTS representantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT, email TEXT, telefone TEXT, celular TEXT,
      cep TEXT, logradouro TEXT, numero TEXT,
      complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
      perc_comissao REAL DEFAULT 5.0,
      observacoes TEXT, ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS comissoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      representante_id INTEGER NOT NULL REFERENCES representantes(id),
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      valor_venda REAL NOT NULL,
      perc_comissao REAL NOT NULL,
      valor_comissao REAL NOT NULL,
      status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente','paga','cancelada')),
      data_pagamento TEXT,
      observacoes TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_comissoes_rep ON comissoes(representante_id, status);
    CREATE INDEX IF NOT EXISTS idx_comissoes_venda ON comissoes(venda_id);
  `);
  // Adiciona representante_id nas vendas se não existir
  safeAddColumn('vendas', 'representante_id', 'INTEGER REFERENCES representantes(id)');

  // ── E-commerce: cria tabelas de pedidos online ─────────────────────────────
  getDB().exec(`
    CREATE TABLE IF NOT EXISTS pedidos_online (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      supabase_id TEXT UNIQUE,
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      cliente_email TEXT,
      tipo_entrega TEXT NOT NULL DEFAULT 'retirada',
      endereco_bairro TEXT, endereco_rua TEXT, endereco_numero TEXT, endereco_complemento TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      frete REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'recebido',
      observacoes TEXT,
      origem TEXT DEFAULT 'web',
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_online_status ON pedidos_online(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_online_data   ON pedidos_online(criado_em);
    CREATE TABLE IF NOT EXISTS itens_pedido_online (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos_online(id) ON DELETE CASCADE,
      produto_id INTEGER REFERENCES produtos(id),
      nome_produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL,
      total REAL NOT NULL
    );
  `);
}

function getDB() {
  if (!db) throw new Error('DB não inicializado');
  return db;
}

// ============================================================
// AUTH
// ============================================================
const auth = {
  login: (email, senha) => {
    const usuario = getDB().prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (!usuario) return null;
    const ok = bcrypt.compareSync(senha, usuario.senha_hash);
    if (!ok) return null;
    const { senha_hash, ...safe } = usuario;
    return safe;
  },
  trocarSenha: (usuario_id, senhaAtual, novaSenha) => {
    const u = getDB().prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(usuario_id);
    if (!u || !bcrypt.compareSync(senhaAtual, u.senha_hash)) throw new Error('Senha atual incorreta');
    const hash = bcrypt.hashSync(novaSenha, 10);
    getDB().prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, usuario_id);
    return true;
  },
  criarUsuario: (data) => {
    const hash = bcrypt.hashSync(data.senha, 10);
    return getDB().prepare(`
      INSERT INTO usuarios (nome, email, senha_hash, cargo) VALUES (?, ?, ?, ?)
    `).run(data.nome, data.email, hash, data.cargo || 'vendedor');
  },
  primeiroAcessoStatus: () => {
    const cfg = configLoja.get() || {};
    const concluidoFlag = Number(cfg.onboarding_primeiro_acesso_concluido || 0) === 1;
    const usuariosCustom = getDB().prepare(`
      SELECT COUNT(*) as total
      FROM usuarios
      WHERE ativo = 1 AND lower(email) != lower(?)
    `).get(DEFAULT_ADMIN_EMAIL)?.total || 0;
    const required = !concluidoFlag && usuariosCustom === 0;
    return {
      required,
      completed: !required,
      hasCustomUsers: usuariosCustom > 0,
      defaultAdminEmail: DEFAULT_ADMIN_EMAIL,
    };
  },
  concluirPrimeiroAcesso: (data) => {
    const nome = String(data?.nome || '').trim();
    const email = String(data?.email || '').trim().toLowerCase();
    const senha = String(data?.senha || '').trim();

    if (!nome || nome.length < 3) throw new Error('Informe um nome com pelo menos 3 caracteres');
    if (!email || !email.includes('@')) throw new Error('Informe um e-mail válido');
    if (!senha || senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres');

    const st = auth.primeiroAcessoStatus();
    if (!st.required) {
      throw new Error('Primeiro acesso já foi concluído nesta instalação');
    }

    const existeEmail = getDB().prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(email);
    if (existeEmail) throw new Error('Já existe um usuário com este e-mail');

    const hash = bcrypt.hashSync(senha, 10);
    const tx = getDB().transaction(() => {
      getDB().prepare(`
        INSERT INTO usuarios (nome, email, senha_hash, cargo, ativo)
        VALUES (?, ?, ?, 'admin', 1)
      `).run(nome, email, hash);
      getDB().prepare(`
        UPDATE usuarios
        SET ativo = 0
        WHERE lower(email) = lower(?)
      `).run(DEFAULT_ADMIN_EMAIL);
      configLoja.update({ onboarding_primeiro_acesso_concluido: 1 });
    });
    tx();
    return { ok: true };
  },
  listarUsuarios: () => getDB().prepare(`SELECT id,nome,email,cargo,ativo,criado_em FROM usuarios ORDER BY nome`).all(),
  ativarDesativar: (id, ativo) => getDB().prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo, id),
};

// ============================================================
// CONFIG LOJA
// ============================================================
const configLoja = {
  get: () => getDB().prepare('SELECT * FROM config_loja WHERE id = 1').get(),
  update: (data) => {
    const permitidos = ['nome','razao_social','cnpj','cpf','inscricao_estadual','inscricao_municipal',
      'regime_tributario','cep','logradouro','numero','complemento','bairro','cidade','estado',
      'telefone','email','site','logo_path','certificado_digital_path','certificado_senha',
      'ambiente_nfe','pdv_tamanho_fonte','pdv_impressora','pdv_largura_papel','chave_licenca','plano',
      'focus_api_key','focus_nfe_habilitado','serie_nfe','serie_nfce','ultimo_numero_nfe','ultimo_numero_nfce',
      'validade_licenca','license_status','license_activated_at','license_last_check','license_offline_grace_until',
      'license_trial_started_at','license_device_id','license_customer_name','license_server_url','license_notes',
      'onboarding_primeiro_acesso_concluido'];
    const campos = Object.keys(data).filter(k => permitidos.includes(k));
    if (!campos.length) return;
    const sets = campos.map(k => `${k} = @${k}`).join(', ');
    return getDB().prepare(`UPDATE config_loja SET ${sets}, atualizado_em = datetime('now','localtime') WHERE id = 1`).run(data);
  }
};

const licenseStore = {
  get: () => {
    const row = configLoja.get() || {};
    return {
      licenseKey: row.chave_licenca || '',
      plan: row.plano || 'basico',
      validUntil: row.validade_licenca || null,
      status: row.license_status || 'trial',
      activatedAt: row.license_activated_at || null,
      lastCheck: row.license_last_check || null,
      offlineGraceUntil: row.license_offline_grace_until || null,
      trialStartedAt: row.license_trial_started_at || row.criado_em || null,
      deviceId: row.license_device_id || null,
      customerName: row.license_customer_name || null,
      serverUrl: row.license_server_url || null,
      notes: row.license_notes || null,
    };
  },
  update: (data) => {
    const mapped = { ...data };
    if (Object.prototype.hasOwnProperty.call(mapped, 'licenseKey')) mapped.chave_licenca = mapped.licenseKey;
    if (Object.prototype.hasOwnProperty.call(mapped, 'plan')) mapped.plano = mapped.plan;
    if (Object.prototype.hasOwnProperty.call(mapped, 'validUntil')) mapped.validade_licenca = mapped.validUntil;
    delete mapped.licenseKey;
    delete mapped.plan;
    delete mapped.validUntil;
    return configLoja.update(mapped);
  }
};
module.exports.licenseStore = licenseStore;

// ============================================================
// CATEGORIAS
// ============================================================
const categorias = {
  listar: () => getDB().prepare('SELECT * FROM categorias WHERE ativo = 1 ORDER BY nome').all(),
  criar: (data) => getDB().prepare('INSERT INTO categorias (nome, descricao, cor) VALUES (@nome, @descricao, @cor)').run(data),
  atualizar: (id, data) => getDB().prepare('UPDATE categorias SET nome=@nome, descricao=@descricao, cor=@cor WHERE id=@id').run({...data, id}),
  deletar: (id) => getDB().prepare('UPDATE categorias SET ativo = 0 WHERE id = ?').run(id),
};

// ============================================================
// PRODUTOS
// ============================================================
const produtos = {
  listar: ({ busca = '', categoria_id = null, ativo = 1, estoque_baixo = false } = {}) => {
    let sql = `SELECT p.*, c.nome as categoria_nome,
      CASE WHEN p.preco_custo > 0
        THEN ROUND(((p.preco_venda - p.preco_custo) / p.preco_custo) * 100, 2)
        ELSE 0 END as margem_lucro
      FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.ativo = @ativo`;
    const params = { ativo };
    if (busca) { sql += ` AND (p.nome LIKE @busca OR p.codigo_barras LIKE @busca OR p.sku LIKE @busca)`; params.busca = `%${busca}%`; }
    if (categoria_id) { sql += ` AND p.categoria_id = @categoria_id`; params.categoria_id = categoria_id; }
    if (estoque_baixo) sql += ` AND p.estoque_atual <= p.estoque_minimo`;
    sql += ` ORDER BY p.nome`;
    return getDB().prepare(sql).all(params);
  },

  buscarPorCodigo: (codigo) => getDB().prepare(`
    SELECT p.*, c.nome as categoria_nome,
      CASE WHEN p.preco_custo > 0 THEN ROUND(((p.preco_venda-p.preco_custo)/p.preco_custo)*100,2) ELSE 0 END as margem_lucro
    FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.codigo_barras = ? OR p.sku = ? LIMIT 1
  `).get(codigo, codigo),

  // Busca inteligente para leitor de código:
  // - código direto (EAN/SKU)
  // - etiqueta de balança (13 dígitos iniciando com 2)
  buscarPorCodigoInteligente: (codigoLido) => {
    const codigo = String(codigoLido || '').trim();
    if (!codigo) return null;

    // 1) Busca direta (código de barras ou SKU)
    const direto = getDB().prepare(`
      SELECT p.*, c.nome as categoria_nome,
        CASE WHEN p.preco_custo > 0 THEN ROUND(((p.preco_venda-p.preco_custo)/p.preco_custo)*100,2) ELSE 0 END as margem_lucro
      FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE (p.codigo_barras = ? OR p.sku = ?) AND p.ativo = 1
      LIMIT 1
    `).get(codigo, codigo);
    if (direto) {
      return {
        produto: direto,
        quantidade: 1,
        total: Number(direto.preco_venda || 0),
        origem: 'direto',
      };
    }

    // 2) Etiqueta de balança (padrão comum BR): 2 + PLU + VALOR + DV
    // Exemplos suportados:
    // - 1 + 5 + 5 + 1  => prefixo(2) + plu5 + valor_cent + dv
    // - 1 + 6 + 5 + 1  => prefixo(2) + plu6 + valor_cent + dv
    if (!/^\d{13}$/.test(codigo) || !codigo.startsWith('2')) return null;

    const plu5 = codigo.slice(1, 6);
    const valor5 = codigo.slice(6, 11);
    const plu6 = codigo.slice(1, 7);
    const valor6 = codigo.slice(7, 12);

    const candidatos = getDB().prepare(`
      SELECT p.*, c.nome as categoria_nome,
        CASE WHEN p.preco_custo > 0 THEN ROUND(((p.preco_venda-p.preco_custo)/p.preco_custo)*100,2) ELSE 0 END as margem_lucro
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.ativo = 1
        AND (
          p.sku = @plu5 OR p.sku = @plu6 OR
          p.codigo_barras = @plu5 OR p.codigo_barras = @plu6
        )
      LIMIT 1
    `).get({ plu5, plu6 });

    if (!candidatos) return null;

    // Primeiro tenta valor no formato de PLU-5, depois PLU-6.
    const valorCent5 = Number(valor5);
    const valorCent6 = Number(valor6);
    const valorCent = Number.isFinite(valorCent5) && valorCent5 > 0 ? valorCent5 : valorCent6;
    const totalEtiqueta = Number((valorCent / 100).toFixed(2));

    let quantidade = 1;
    const precoVenda = Number(candidatos.preco_venda || 0);
    if (precoVenda > 0) {
      quantidade = Number((totalEtiqueta / precoVenda).toFixed(3));
      if (quantidade <= 0) quantidade = 1;
    }

    return {
      produto: candidatos,
      quantidade,
      total: totalEtiqueta > 0 ? totalEtiqueta : Number(candidatos.preco_venda || 0),
      origem: 'balanca',
      codigo_lido: codigo,
    };
  },

  buscarPorId: (id) => getDB().prepare(`
    SELECT p.*, c.nome as categoria_nome,
      CASE WHEN p.preco_custo > 0 THEN ROUND(((p.preco_venda-p.preco_custo)/p.preco_custo)*100,2) ELSE 0 END as margem_lucro
    FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?
  `).get(id),

  criar: (data) => {
    const stmt = getDB().prepare(`
      INSERT INTO produtos (nome, descricao, codigo_barras, sku, categoria_id, preco_custo, preco_venda,
        ncm, cfop, cst_icms, cst_pis, cst_cofins, aliquota_icms, aliquota_pis, aliquota_cofins,
        unidade_medida, origem_produto, estoque_atual, estoque_minimo, estoque_maximo, localizacao)
      VALUES (@nome, @descricao, @codigo_barras, @sku, @categoria_id, @preco_custo, @preco_venda,
        @ncm, @cfop, @cst_icms, @cst_pis, @cst_cofins, @aliquota_icms, @aliquota_pis, @aliquota_cofins,
        @unidade_medida, @origem_produto, @estoque_atual, @estoque_minimo, @estoque_maximo, @localizacao)
    `);
    const result = stmt.run({
      descricao: '', codigo_barras: null, sku: null, categoria_id: null,
      preco_custo: 0, ncm: null, cfop: '5102', cst_icms: '400', cst_pis: '07', cst_cofins: '07',
      aliquota_icms: 0, aliquota_pis: 0.65, aliquota_cofins: 3,
      unidade_medida: 'UN', origem_produto: 0, estoque_atual: 0,
      estoque_minimo: 5, estoque_maximo: 1000, localizacao: null,
      ...data
    });
    // Entrada de estoque inicial
    if (data.estoque_atual > 0) {
      getDB().prepare(`INSERT INTO movimentacoes_estoque (produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo)
        VALUES (?,  'entrada', ?, 0, ?, 'Estoque inicial')`).run(result.lastInsertRowid, data.estoque_atual, data.estoque_atual);
    }
    return result;
  },

  atualizar: (id, data) => {
    const campos = ['nome','descricao','codigo_barras','sku','categoria_id','preco_custo','preco_venda',
      'ncm','cfop','cst_icms','cst_pis','cst_cofins','aliquota_icms','aliquota_pis','aliquota_cofins',
      'unidade_medida','origem_produto','estoque_minimo','estoque_maximo','localizacao','ativo',
      'estoque_atual','permitir_venda_sem_estoque',
      'data_validade','dias_validade_alerta','percentual_lucro','codigo_lote',
      'online_foto_url','online_descricao','online_ativo','online_destaque',
      'preco_promocional','promocao_ativa'];
    const sets = campos.filter(c => c in data).map(c => `${c} = @${c}`).join(', ');
    return getDB().prepare(`UPDATE produtos SET ${sets}, atualizado_em=datetime('now','localtime') WHERE id=@id`).run({...data, id});
  },

  deletar: (id) => getDB().prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(id),

  estoqueBaixo: () => getDB().prepare(
    `SELECT p.*, c.nome as categoria_nome FROM produtos p
     LEFT JOIN categorias c ON p.categoria_id = c.id
     WHERE p.estoque_atual <= p.estoque_minimo AND p.ativo = 1 ORDER BY p.estoque_atual ASC`
  ).all(),
};

// ============================================================
// MOVIMENTAÇÕES DE ESTOQUE
// ============================================================
const estoque = {
  listar: (produto_id, limite = 100) => getDB().prepare(`
    SELECT m.*, u.nome as usuario_nome FROM movimentacoes_estoque m
    LEFT JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.produto_id = ? ORDER BY m.criado_em DESC LIMIT ?
  `).all(produto_id, limite),

  ajustar: (produto_id, nova_quantidade, motivo, usuario_id) => {
    const p = getDB().prepare('SELECT estoque_atual FROM produtos WHERE id = ?').get(produto_id);
    return getDB().transaction(() => {
      getDB().prepare(`INSERT INTO movimentacoes_estoque (produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo,usuario_id)
        VALUES (?,  'ajuste', ?, ?, ?, ?, ?)`).run(produto_id, Math.abs(nova_quantidade - p.estoque_atual), p.estoque_atual, nova_quantidade, motivo, usuario_id);
      getDB().prepare(`UPDATE produtos SET estoque_atual=?, atualizado_em=datetime('now','localtime') WHERE id=?`).run(nova_quantidade, produto_id);
    })();
  },

  entrada: (produto_id, quantidade, preco_custo, motivo, usuario_id) => {
    const p = getDB().prepare('SELECT estoque_atual FROM produtos WHERE id = ?').get(produto_id);
    const novo = p.estoque_atual + quantidade;
    return getDB().transaction(() => {
      getDB().prepare(`INSERT INTO movimentacoes_estoque (produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,preco_custo,motivo,usuario_id)
        VALUES (?, 'entrada', ?, ?, ?, ?, ?, ?)`).run(produto_id, quantidade, p.estoque_atual, novo, preco_custo, motivo, usuario_id);
      getDB().prepare(`UPDATE produtos SET estoque_atual=?, preco_custo=?, atualizado_em=datetime('now','localtime') WHERE id=?`).run(novo, preco_custo || p.preco_custo, produto_id);
    })();
  },
};

// ============================================================
// CLIENTES
// ============================================================
const clientes = {
  listar: ({ busca = '', ativo = 1 } = {}) => {
    let sql = `SELECT * FROM clientes WHERE ativo = @ativo`;
    const params = { ativo };
    if (busca) { sql += ` AND (nome LIKE @busca OR cpf LIKE @busca OR cnpj LIKE @busca OR telefone LIKE @busca OR celular LIKE @busca)`; params.busca = `%${busca}%`; }
    return getDB().prepare(sql + ' ORDER BY nome').all(params);
  },
  buscarPorId: (id) => getDB().prepare('SELECT * FROM clientes WHERE id = ?').get(id),
  criar: (data) => {
    const campos = ['nome','tipo_pessoa','cpf','cnpj','rg','data_nascimento','email','telefone','celular',
      'whatsapp','cep','logradouro','numero','complemento','bairro','cidade','estado','observacoes'];
    const sets = campos.filter(c => c in data);
    return getDB().prepare(`INSERT INTO clientes (${sets.join(',')}) VALUES (${sets.map(c=>'@'+c).join(',')})`)
      .run(data);
  },
  atualizar: (id, data) => {
    const campos = ['nome','tipo_pessoa','cpf','cnpj','rg','data_nascimento','email','telefone','celular',
      'whatsapp','cep','logradouro','numero','complemento','bairro','cidade','estado','observacoes','ativo'];
    const sets = campos.filter(c => c in data).map(c => `${c} = @${c}`).join(', ');
    return getDB().prepare(`UPDATE clientes SET ${sets}, atualizado_em=datetime('now','localtime') WHERE id=@id`).run({...data, id});
  },
  deletar: (id) => getDB().prepare('UPDATE clientes SET ativo = 0 WHERE id = ?').run(id),
  historico: (cliente_id) => getDB().prepare(`
    SELECT v.numero, v.total, v.forma_pagamento, v.criado_em
    FROM vendas v WHERE v.cliente_id = ? AND v.status = 'concluida'
    ORDER BY v.criado_em DESC LIMIT 50
  `).all(cliente_id),
};

// ============================================================
// CAIXA
// ============================================================
const caixa = {
  abrir: ({ usuario_id, saldo_abertura, observacao, numero_pdv = 1 }) => {
    const aberto = caixa.buscarAberto(numero_pdv);
    if (aberto) throw new Error(`PDV ${numero_pdv} já está aberto (caixa #${aberto.id})`);
    return getDB().transaction(() => {
      const r = getDB().prepare(`INSERT INTO caixas (numero_pdv,usuario_id,saldo_abertura,observacao_abertura,status)
        VALUES (?,?,?,?,'aberto')`).run(numero_pdv, usuario_id, saldo_abertura, observacao);
      getDB().prepare(`INSERT INTO movimentacoes_caixa (caixa_id,tipo,valor,motivo,usuario_id) VALUES (?,'abertura',?,?,?)`)
        .run(r.lastInsertRowid, saldo_abertura, 'Abertura de caixa', usuario_id);
      return r;
    })();
  },

  buscarAberto: (numero_pdv = 1) => getDB().prepare(`
    SELECT c.*, u.nome as usuario_nome FROM caixas c
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE c.numero_pdv = ? AND c.status = 'aberto' ORDER BY c.id DESC LIMIT 1
  `).get(numero_pdv),

  fechar: ({ caixa_id, saldo_informado, observacao, usuario_id }) => {
    return getDB().transaction(() => {
      const totais = caixa.calcularTotais(caixa_id);
      const saldo_esperado = (totais.abertura || 0) + (totais.por_forma?.dinheiro?.total || 0)
        + (totais.suprimentos || 0) - (totais.sangrias || 0);
      const diferenca = saldo_informado - saldo_esperado;

      getDB().prepare(`UPDATE caixas SET status='fechado', data_fechamento=datetime('now','localtime'),
        saldo_esperado=@se, saldo_informado=@si, diferenca=@dif,
        observacao_fechamento=@obs, usuario_fechamento_id=@uid WHERE id=@id`)
        .run({ se: saldo_esperado, si: saldo_informado, dif: diferenca, obs: observacao, uid: usuario_id, id: caixa_id });

      getDB().prepare(`INSERT INTO movimentacoes_caixa (caixa_id,tipo,valor,motivo,usuario_id) VALUES (?,'fechamento',?,?,?)`)
        .run(caixa_id, saldo_informado, 'Fechamento de caixa', usuario_id);

      return { saldo_esperado, saldo_informado, diferenca, ...totais };
    })();
  },

  suprimento: ({ caixa_id, valor, motivo, usuario_id }) => {
    return getDB().prepare(`INSERT INTO movimentacoes_caixa (caixa_id,tipo,valor,motivo,usuario_id) VALUES (?,'suprimento',?,?,?)`)
      .run(caixa_id, valor, motivo, usuario_id);
  },

  sangria: ({ caixa_id, valor, motivo, usuario_id }) => {
    return getDB().prepare(`INSERT INTO movimentacoes_caixa (caixa_id,tipo,valor,motivo,usuario_id) VALUES (?,'sangria',?,?,?)`)
      .run(caixa_id, valor, motivo, usuario_id);
  },

  calcularTotais: (caixa_id) => {
    const vendas_raw = getDB().prepare(`
      SELECT pv.forma, SUM(pv.valor) as total, COUNT(DISTINCT v.id) as qtd
      FROM pagamentos_venda pv JOIN vendas v ON v.id = pv.venda_id
      WHERE v.caixa_id = ? AND v.status = 'concluida'
      GROUP BY pv.forma
    `).all(caixa_id);

    const movs = getDB().prepare(`SELECT tipo, SUM(valor) as total FROM movimentacoes_caixa WHERE caixa_id = ? GROUP BY tipo`).all(caixa_id);
    const por_forma = {};
    vendas_raw.forEach(v => { por_forma[v.forma] = v; });
    const suprimentos = movs.find(m => m.tipo === 'suprimento')?.total || 0;
    const sangrias = movs.find(m => m.tipo === 'sangria')?.total || 0;
    const abertura = movs.find(m => m.tipo === 'abertura')?.total || 0;

    return {
      por_forma,
      total_vendas: vendas_raw.reduce((s, v) => s + v.total, 0),
      qtd_vendas: vendas_raw.reduce((s, v) => s + v.qtd, 0),
      suprimentos, sangrias, abertura,
    };
  },

  movimentacoes: (caixa_id) => getDB().prepare(`
    SELECT m.*, u.nome as usuario_nome FROM movimentacoes_caixa m
    LEFT JOIN usuarios u ON m.usuario_id = u.id WHERE m.caixa_id = ? ORDER BY m.criado_em ASC
  `).all(caixa_id),

  historico: (limite = 30) => getDB().prepare(`
    SELECT c.*, u.nome as usuario_nome, uf.nome as usuario_fechamento_nome
    FROM caixas c LEFT JOIN usuarios u ON c.usuario_id = u.id
    LEFT JOIN usuarios uf ON c.usuario_fechamento_id = uf.id
    ORDER BY c.id DESC LIMIT ?
  `).all(limite),
};

// ============================================================
// VENDAS
// ============================================================
function gerarNumeroVenda() {
  const hoje = new Date();
  const prefixo = `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}`;
  const ultimo = getDB().prepare(`SELECT numero FROM vendas WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefixo}%`);
  const seq = ultimo ? parseInt(ultimo.numero.split('-')[1] || '0') + 1 : 1;
  return `${prefixo}-${String(seq).padStart(4,'0')}`;
}

function gerarNumeroPedido() {
  const ultimo = getDB().prepare(`SELECT numero FROM pedidos ORDER BY id DESC LIMIT 1`).get();
  const seq = ultimo ? parseInt(ultimo.numero || '0') + 1 : 1;
  return String(seq).padStart(6, '0');
}

const vendas = {
  criar: ({ caixa_id, cliente_id, usuario_id, itens, pagamentos,
            desconto_valor = 0, desconto_percentual = 0, tipo_cupom = 'nao_fiscal',
            cpf_nota, observacoes }) => {
    return getDB().transaction(() => {
      const subtotal = itens.reduce((s, i) => s + i.total, 0);
      const total = subtotal - desconto_valor;
      const numero = gerarNumeroVenda();
      const total_recebido = pagamentos.reduce((s, p) => s + p.valor, 0);
      const troco = Math.max(0, total_recebido - total);

      const r = getDB().prepare(`
        INSERT INTO vendas (numero,caixa_id,cliente_id,usuario_id,status,subtotal,desconto_valor,
          desconto_percentual,total,forma_pagamento,valor_recebido,troco,tipo_cupom,cpf_nota,observacoes)
        VALUES (@numero,@caixa_id,@cliente_id,@usuario_id,'concluida',@subtotal,@desconto_valor,
          @desconto_percentual,@total,@forma_pagamento,@valor_recebido,@troco,@tipo_cupom,@cpf_nota,@observacoes)
      `).run({
        numero, caixa_id, cliente_id: cliente_id || null, usuario_id, subtotal,
        desconto_valor, desconto_percentual, total,
        forma_pagamento: pagamentos[0]?.forma || 'dinheiro',
        valor_recebido: total_recebido, troco, tipo_cupom,
        cpf_nota: cpf_nota || null, observacoes: observacoes || null
      });
      const venda_id = r.lastInsertRowid;

      // Itens (trigger cuida do estoque)
      const stmtItem = getDB().prepare(`
        INSERT INTO itens_venda (venda_id,produto_id,nome_produto,codigo_barras,quantidade,
          preco_unitario,preco_custo,desconto_valor,desconto_percentual,total,ncm,cfop,cst_icms,aliquota_icms)
        VALUES (@venda_id,@produto_id,@nome_produto,@codigo_barras,@quantidade,
          @preco_unitario,@preco_custo,@desconto_valor,@desconto_percentual,@total,@ncm,@cfop,@cst_icms,@aliquota_icms)
      `);
      itens.forEach(i => stmtItem.run({
        venda_id, desconto_valor: 0, desconto_percentual: 0,
        preco_custo: 0, ncm: null, cfop: null, cst_icms: null, aliquota_icms: 0, ...i
      }));

      // Pagamentos
      const stmtPag = getDB().prepare(`INSERT INTO pagamentos_venda (venda_id,forma,valor,parcelas,nsu,bandeira) VALUES (@venda_id,@forma,@valor,@parcelas,@nsu,@bandeira)`);
      pagamentos.forEach(p => stmtPag.run({ venda_id, parcelas: 1, nsu: null, bandeira: null, ...p }));

      // Pontos de fidelidade
      if (cliente_id) {
        getDB().prepare(`UPDATE clientes SET pontos_fidelidade = pontos_fidelidade + ? WHERE id = ?`)
          .run(Math.floor(total / 10), cliente_id);
      }

      return { venda_id, numero, total, troco };
    })();
  },

  cancelar: (venda_id, motivo, usuario_id) => {
    return getDB().transaction(() => {
      const venda = getDB().prepare('SELECT status FROM vendas WHERE id = ?').get(venda_id);
      if (!venda || venda.status === 'cancelada') throw new Error('Venda não pode ser cancelada');

      getDB().prepare(`UPDATE vendas SET status='cancelada', observacoes=COALESCE(observacoes||' | ','')|| 'CANCELADA: '||? WHERE id=?`)
        .run(motivo || 'Cancelada pelo operador', venda_id);

      // Estorno de estoque
      const itens = getDB().prepare('SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = ?').all(venda_id);
      itens.forEach(item => {
        const p = getDB().prepare('SELECT estoque_atual FROM produtos WHERE id = ?').get(item.produto_id);
        getDB().prepare(`INSERT INTO movimentacoes_estoque (produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo,venda_id)
          VALUES (?, 'devolucao', ?, ?, ?, 'Cancelamento de venda', ?)`).run(item.produto_id, item.quantidade, p.estoque_atual, p.estoque_atual + item.quantidade, venda_id);
        getDB().prepare('UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?').run(item.quantidade, item.produto_id);
      });
    })();
  },

  buscar: (id) => getDB().prepare(`
    SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome
    FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id LEFT JOIN usuarios u ON v.usuario_id = u.id WHERE v.id = ?
  `).get(id),

  itens: (venda_id) => getDB().prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(venda_id),
  pagamentos: (venda_id) => getDB().prepare('SELECT * FROM pagamentos_venda WHERE venda_id = ?').all(venda_id),

  listar: ({ data_inicio, data_fim, caixa_id, cliente_id, status, usuario_id, limite = 200 } = {}) => {
    let sql = `SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome
      FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id LEFT JOIN usuarios u ON v.usuario_id = u.id WHERE 1=1`;
    const p = {};
    if (status) { sql += ` AND v.status = @status`; p.status = status; }
    if (caixa_id) { sql += ` AND v.caixa_id = @caixa_id`; p.caixa_id = caixa_id; }
    if (cliente_id) { sql += ` AND v.cliente_id = @cliente_id`; p.cliente_id = cliente_id; }
    if (usuario_id) { sql += ` AND v.usuario_id = @usuario_id`; p.usuario_id = usuario_id; }
    if (data_inicio) { sql += ` AND date(v.criado_em) >= @di`; p.di = data_inicio; }
    if (data_fim) { sql += ` AND date(v.criado_em) <= @df`; p.df = data_fim; }
    sql += ` ORDER BY v.criado_em DESC LIMIT @limite`;
    p.limite = limite;
    return getDB().prepare(sql).all(p);
  },
};

// ============================================================
// PEDIDOS / ORÇAMENTOS
// ============================================================
const pedidos = {
  criar: ({ cliente_id, usuario_id, tipo = 'orcamento', itens, desconto_valor = 0,
            desconto_percentual = 0, data_validade, observacoes, condicoes_pagamento,
            prazo_entrega = '', validade_dias = 7, subtotal: subParam, total: totalParam } = {}) => {
    return getDB().transaction(() => {
      const subtotal = subParam || itens.reduce((s, i) => s + i.total, 0);
      const total = totalParam || (subtotal - desconto_valor);
      const numero = gerarNumeroPedido();

      const r = getDB().prepare(`
        INSERT INTO pedidos (numero,tipo,cliente_id,usuario_id,subtotal,desconto_valor,desconto_percentual,total,data_validade,observacoes,condicoes_pagamento,prazo_entrega,validade_dias)
        VALUES (@numero,@tipo,@cliente_id,@usuario_id,@subtotal,@desconto_valor,@desconto_percentual,@total,@data_validade,@observacoes,@condicoes_pagamento,@prazo_entrega,@validade_dias)
      `).run({ numero, tipo, cliente_id: cliente_id || null, usuario_id, subtotal, desconto_valor, desconto_percentual, total, data_validade: data_validade || null, observacoes: observacoes || null, condicoes_pagamento: condicoes_pagamento || null, prazo_entrega: prazo_entrega || '', validade_dias: validade_dias || 7 });

      const stmtItem = getDB().prepare(`INSERT INTO itens_pedido (pedido_id,produto_id,nome_produto,quantidade,preco_unitario,desconto_percentual,total) VALUES (@pedido_id,@produto_id,@nome_produto,@quantidade,@preco_unitario,@desconto_percentual,@total)`);
      itens.forEach(i => stmtItem.run({ ...i, pedido_id: r.lastInsertRowid, desconto_percentual: 0 }));

      return { pedido_id: r.lastInsertRowid, numero };
    })();
  },

  buscar: (id) => getDB().prepare(`SELECT p.*, c.nome as cliente_nome, u.nome as usuario_nome FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id LEFT JOIN usuarios u ON p.usuario_id = u.id WHERE p.id = ?`).get(id),
  itens: (pedido_id) => getDB().prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedido_id),
  listar: ({ status, cliente_id, limite = 100 } = {}) => {
    let sql = `SELECT p.*, c.nome as cliente_nome FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE 1=1`;
    const params = {};
    if (status) { sql += ` AND p.status = @status`; params.status = status; }
    if (cliente_id) { sql += ` AND p.cliente_id = @cliente_id`; params.cliente_id = cliente_id; }
    return getDB().prepare(sql + ` ORDER BY p.criado_em DESC LIMIT @limite`).all({ ...params, limite });
  },
  atualizarStatus: (id, status) => getDB().prepare(`UPDATE pedidos SET status=?, atualizado_em=datetime('now','localtime') WHERE id=?`).run(status, id),

  converterEmVenda: (pedido_id, { caixa_id, pagamentos, cpf_nota, tipo_cupom }) => {
    const pedido = pedidos.buscar(pedido_id);
    if (!pedido) throw new Error('Pedido não encontrado');
    const itens_ped = pedidos.itens(pedido_id);
    const itens = itens_ped.map(i => ({
      produto_id: i.produto_id, nome_produto: i.nome_produto,
      quantidade: i.quantidade, preco_unitario: i.preco_unitario, total: i.total
    }));
    const venda_result = vendas.criar({ caixa_id, cliente_id: pedido.cliente_id,
      usuario_id: pedido.usuario_id, itens, pagamentos,
      desconto_valor: pedido.desconto_valor, cpf_nota, tipo_cupom });
    pedidos.atualizarStatus(pedido_id, 'convertido');
    return venda_result;
  },
};

// ============================================================
// CONFERÊNCIA DE CAIXA
// ============================================================
const conferencia = {
  dadosSistema: (data_referencia, numero_pdv = 1) => {
    const dados = getDB().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN pv.forma='dinheiro' THEN pv.valor END),0) as dinheiro_sistema,
        COALESCE(SUM(CASE WHEN pv.forma='credito'  THEN pv.valor END),0) as credito_sistema,
        COALESCE(SUM(CASE WHEN pv.forma='debito'   THEN pv.valor END),0) as debito_sistema,
        COALESCE(SUM(CASE WHEN pv.forma='pix'      THEN pv.valor END),0) as pix_sistema,
        COALESCE(SUM(CASE WHEN pv.forma='voucher'  THEN pv.valor END),0) as voucher_sistema,
        COUNT(DISTINCT v.id) as qtd_vendas,
        COALESCE(SUM(v.total),0) as total_vendas,
        COALESCE(SUM(v.desconto_valor),0) as total_descontos,
        MIN(v.criado_em) as primeira_venda,
        MAX(v.criado_em) as ultima_venda
      FROM pagamentos_venda pv
      JOIN vendas v ON v.id = pv.venda_id
      JOIN caixas c ON c.id = v.caixa_id
      WHERE v.status='concluida' AND date(v.criado_em)=? AND c.numero_pdv=?
    `).get(data_referencia, numero_pdv);

    // Operador que trabalhou nesse PDV nesse dia
    const operador = getDB().prepare(`
      SELECT u.nome, u.cargo FROM caixas c
      JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.numero_pdv=? AND date(c.data_abertura)=?
      ORDER BY c.data_abertura DESC LIMIT 1
    `).get(numero_pdv, data_referencia);

    return { ...dados, operador_nome: operador?.nome || null, operador_cargo: operador?.cargo || null };
  },

  salvar: (data) => {
    const sistema = conferencia.dadosSistema(data.data_referencia, data.numero_pdv || 1);
    const dif_dinheiro = (data.dinheiro_conferido ?? sistema.dinheiro_sistema) - sistema.dinheiro_sistema;
    const dif_credito  = (data.credito_conferido  ?? sistema.credito_sistema)  - sistema.credito_sistema;
    const dif_debito   = (data.debito_conferido   ?? sistema.debito_sistema)   - sistema.debito_sistema;
    const dif_pix      = (data.pix_conferido      ?? sistema.pix_sistema)      - sistema.pix_sistema;
    const dif_voucher  = (data.voucher_conferido  ?? sistema.voucher_sistema)  - sistema.voucher_sistema;
    const tem_divergencia = [dif_dinheiro, dif_credito, dif_debito, dif_pix, dif_voucher].some(d => Math.abs(d) > 0.005);

    const existente = getDB().prepare(`SELECT id FROM conferencias_caixa WHERE data_referencia=? AND numero_pdv=?`).get(data.data_referencia, data.numero_pdv || 1);
    const payload = {
      ds: sistema.dinheiro_sistema, cs: sistema.credito_sistema,
      dbs: sistema.debito_sistema,  ps: sistema.pix_sistema,
      dc: data.dinheiro_conferido ?? sistema.dinheiro_sistema,
      cc: data.credito_conferido  ?? sistema.credito_sistema,
      dbc: data.debito_conferido  ?? sistema.debito_sistema,
      pc: data.pix_conferido      ?? sistema.pix_sistema,
      status: tem_divergencia ? 'divergente' : 'conferido',
      obs: data.observacoes || null,
      gerente_id: data.gerente_id || null,
    };

    if (existente) {
      return getDB().prepare(`UPDATE conferencias_caixa SET
        dinheiro_sistema=@ds, credito_sistema=@cs, debito_sistema=@dbs, pix_sistema=@ps,
        dinheiro_conferido=@dc, credito_conferido=@cc, debito_conferido=@dbc, pix_conferido=@pc,
        status=@status, observacoes=@obs, usuario_id=@gerente_id
        WHERE id=@id`).run({ ...payload, id: existente.id });
    }
    return getDB().prepare(`INSERT INTO conferencias_caixa
      (data_referencia,numero_pdv,usuario_id,dinheiro_sistema,credito_sistema,debito_sistema,pix_sistema,
       dinheiro_conferido,credito_conferido,debito_conferido,pix_conferido,status,observacoes)
      VALUES (@dr,@pdv,@gerente_id,@ds,@cs,@dbs,@ps,@dc,@cc,@dbc,@pc,@status,@obs)`).run({
        dr: data.data_referencia, pdv: data.numero_pdv || 1, ...payload
      });
  },

  listar: ({ mes, ano, inicio, fim, pdv } = {}) => {
    let where = `WHERE 1=1`;
    const p = [];
    if (inicio && fim) { where += ` AND c.data_referencia BETWEEN ? AND ?`; p.push(inicio, fim); }
    else if (mes && ano) { where += ` AND strftime('%Y',c.data_referencia)=? AND strftime('%m',c.data_referencia)=?`; p.push(String(ano), String(mes).padStart(2,'0')); }
    if (pdv) { where += ` AND c.numero_pdv=?`; p.push(pdv); }

    return getDB().prepare(`
      SELECT c.*,
        u.nome as gerente_nome,
        (COALESCE(c.dinheiro_conferido,c.dinheiro_sistema)-c.dinheiro_sistema) as dif_dinheiro,
        (COALESCE(c.credito_conferido,c.credito_sistema)-c.credito_sistema)   as dif_credito,
        (COALESCE(c.debito_conferido,c.debito_sistema)-c.debito_sistema)      as dif_debito,
        (COALESCE(c.pix_conferido,c.pix_sistema)-c.pix_sistema)               as dif_pix,
        (COALESCE(c.dinheiro_sistema,0)+COALESCE(c.credito_sistema,0)+COALESCE(c.debito_sistema,0)+COALESCE(c.pix_sistema,0)) as total_sistema,
        (COALESCE(c.dinheiro_conferido,c.dinheiro_sistema)+COALESCE(c.credito_conferido,c.credito_sistema)+COALESCE(c.debito_conferido,c.debito_sistema)+COALESCE(c.pix_conferido,c.pix_sistema)) as total_conferido
      FROM conferencias_caixa c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      ${where}
      ORDER BY c.data_referencia DESC, c.numero_pdv ASC
      LIMIT 500
    `).all(...p);
  },

  pdvsAtivos: () => {
    // Retorna quantos PDVs diferentes existem
    const r = getDB().prepare(`SELECT MAX(numero_pdv) as max_pdv FROM caixas`).get();
    return r?.max_pdv || 1;
  },
};

// ============================================================
// RELATÓRIOS
// ============================================================
const relatorios = {
  resumo: (data_inicio, data_fim) => getDB().prepare(`
    SELECT
      COUNT(DISTINCT v.id) as total_vendas,
      COALESCE(SUM(v.total),0) as receita_total,
      COALESCE(AVG(v.total),0) as ticket_medio,
      COALESCE(SUM(v.desconto_valor),0) as total_descontos,
      COALESCE(SUM(iv.total - (iv.preco_custo * iv.quantidade)),0) as lucro_bruto
    FROM vendas v LEFT JOIN itens_venda iv ON iv.venda_id = v.id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
  `).get(data_inicio, data_fim),

  vendasPorDia: (data_inicio, data_fim) => getDB().prepare(`
    SELECT date(v.criado_em) as data,
      COUNT(*) as qtd_vendas, COALESCE(SUM(v.total),0) as total,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='dinheiro' THEN v.total END),0) as dinheiro,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='credito'  THEN v.total END),0) as credito,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='debito'   THEN v.total END),0) as debito,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='pix'      THEN v.total END),0) as pix
    FROM vendas v WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    GROUP BY date(v.criado_em) ORDER BY data ASC
  `).all(data_inicio, data_fim),

  vendasPorMes: (ano) => getDB().prepare(`
    SELECT strftime('%m',criado_em) as mes,
      COUNT(*) as qtd, COALESCE(SUM(total),0) as total
    FROM vendas WHERE status='concluida' AND strftime('%Y',criado_em)=?
    GROUP BY mes ORDER BY mes ASC
  `).all(String(ano)),

  topProdutos: (data_inicio, data_fim, limite = 10) => getDB().prepare(`
    SELECT p.nome, p.codigo_barras, p.unidade_medida,
      SUM(iv.quantidade) as qtd_vendida,
      COALESCE(SUM(iv.total),0) as receita,
      COALESCE(SUM(iv.total - (iv.preco_custo * iv.quantidade)),0) as lucro
    FROM itens_venda iv JOIN produtos p ON p.id = iv.produto_id JOIN vendas v ON v.id = iv.venda_id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    GROUP BY p.id ORDER BY receita DESC LIMIT ?
  `).all(data_inicio, data_fim, limite),

  formaPagamento: (data_inicio, data_fim) => getDB().prepare(`
    SELECT pv.forma, COUNT(*) as qtd, COALESCE(SUM(pv.valor),0) as total
    FROM pagamentos_venda pv JOIN vendas v ON v.id = pv.venda_id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    GROUP BY pv.forma ORDER BY total DESC
  `).all(data_inicio, data_fim),

  estoqueCritico: () => getDB().prepare(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.estoque_atual <= p.estoque_minimo AND p.ativo = 1 ORDER BY (p.estoque_atual - p.estoque_minimo) ASC
  `).all(),

  fluxoCaixa: (data_inicio, data_fim) => {
    const entradas = getDB().prepare(`
      SELECT date(v.criado_em) as data, SUM(v.total) as total FROM vendas v
      WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ? GROUP BY date(v.criado_em)
    `).all(data_inicio, data_fim);
    return entradas;
  },
};

// ============================================================
// FINANCEIRO
// ============================================================
const financeiro = {
  listar: ({ tipo, status, data_inicio, data_fim } = {}) => {
    let sql = `SELECT c.*, cl.nome as cliente_nome FROM contas c LEFT JOIN clientes cl ON c.cliente_id = cl.id WHERE 1=1`;
    const p = {};
    if (tipo) { sql += ` AND c.tipo=@tipo`; p.tipo = tipo; }
    if (status) { sql += ` AND c.status=@status`; p.status = status; }
    if (data_inicio) { sql += ` AND date(c.data_vencimento) >= @di`; p.di = data_inicio; }
    if (data_fim) { sql += ` AND date(c.data_vencimento) <= @df`; p.df = data_fim; }
    return getDB().prepare(sql + ' ORDER BY c.data_vencimento ASC').all(p);
  },
  criar: (data) => {
    const row = {
      tipo:            data.tipo            || 'pagar',
      descricao:       data.descricao       || '',
      categoria:       data.categoria       || 'Outros',
      valor:           Number(data.valor)   || 0,
      data_vencimento: data.data_vencimento || null,
      status:          data.status          || 'aberta',
      cliente_id:      data.cliente_id      || null,
      observacoes:     data.observacoes     || null,
      usuario_id:      data.usuario_id      || null,
    };
    return getDB().prepare(`INSERT INTO contas (tipo,descricao,categoria,valor,data_vencimento,status,cliente_id,observacoes,usuario_id) VALUES (@tipo,@descricao,@categoria,@valor,@data_vencimento,@status,@cliente_id,@observacoes,@usuario_id)`).run(row);
  },
  baixar: (id, valor_pago, forma_pagamento, data_pagamento) => {
    const c = getDB().prepare('SELECT valor FROM contas WHERE id = ?').get(id);
    const total_pago = (c.valor_pago || 0) + valor_pago;
    const novo_status = total_pago >= c.valor ? 'paga' : 'parcial';
    return getDB().prepare(`UPDATE contas SET valor_pago=?, status=?, forma_pagamento=?, data_pagamento=? WHERE id=?`)
      .run(total_pago, novo_status, forma_pagamento, data_pagamento, id);
  },
};

module.exports = {
  initDB, getDB,
  auth, configLoja, categorias,
  produtos, estoque,
  clientes, caixa, vendas, pedidos,
  conferencia, relatorios, financeiro,
  licenseStore,
};

// Patch: adicionar funções de relatório avançado e despesas mensais
// Injetado em runtime sobre o módulo existente

// ── Curva ABC ────────────────────────────────────────────────
const relatoriosExtra = {
  curvaABC: (data_inicio, data_fim) => {
    const itens = getDB().prepare(`
      SELECT p.id, p.nome, p.codigo_barras, p.unidade_medida,
        SUM(iv.quantidade) as qtd_vendida,
        COALESCE(SUM(iv.total),0) as receita,
        COALESCE(SUM(iv.total - (iv.preco_custo * iv.quantidade)),0) as lucro
      FROM itens_venda iv
      JOIN produtos p ON p.id = iv.produto_id
      JOIN vendas v ON v.id = iv.venda_id
      WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
      GROUP BY p.id ORDER BY receita DESC
    `).all(data_inicio, data_fim);

    const total = itens.reduce((s, i) => s + i.receita, 0);
    let acumulado = 0;
    return itens.map(item => {
      const pct = total > 0 ? (item.receita / total) * 100 : 0;
      acumulado += pct;
      const curva = acumulado <= 70 ? 'A' : acumulado <= 90 ? 'B' : 'C';
      return { ...item, pct_receita: pct, pct_acumulado: acumulado, curva };
    });
  },

  vendasPorPDV: (data_inicio, data_fim) => getDB().prepare(`
    SELECT c.numero_pdv,
      COUNT(DISTINCT v.id) as qtd_vendas,
      COALESCE(SUM(v.total),0) as total,
      COALESCE(AVG(v.total),0) as ticket_medio,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='dinheiro' THEN v.total END),0) as dinheiro,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='credito'  THEN v.total END),0) as credito,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='debito'   THEN v.total END),0) as debito,
      COALESCE(SUM(CASE WHEN v.forma_pagamento='pix'      THEN v.total END),0) as pix
    FROM vendas v LEFT JOIN caixas c ON c.id = v.caixa_id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    GROUP BY c.numero_pdv ORDER BY total DESC
  `).all(data_inicio, data_fim),

  rankingClientes: (data_inicio, data_fim, limite = 20) => getDB().prepare(`
    SELECT cl.nome, cl.telefone, cl.celular,
      COUNT(v.id) as qtd_compras,
      COALESCE(SUM(v.total),0) as total_gasto,
      COALESCE(AVG(v.total),0) as ticket_medio,
      MAX(v.criado_em) as ultima_compra
    FROM vendas v JOIN clientes cl ON cl.id = v.cliente_id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    GROUP BY cl.id ORDER BY total_gasto DESC LIMIT ?
  `).all(data_inicio, data_fim, limite),

  lucroPeriodo: (data_inicio, data_fim) => getDB().prepare(`
    SELECT
      COALESCE(SUM(v.total),0) as receita_bruta,
      COALESCE(SUM(v.desconto_valor),0) as descontos,
      COALESCE(SUM(iv.preco_custo * iv.quantidade),0) as cmv,
      COALESCE(SUM(iv.total),0) as receita_liquida,
      COALESCE(SUM(iv.total - (iv.preco_custo * iv.quantidade)),0) as lucro_bruto,
      COUNT(DISTINCT v.id) as qtd_vendas,
      COALESCE(AVG(v.total),0) as ticket_medio
    FROM vendas v LEFT JOIN itens_venda iv ON iv.venda_id = v.id
    WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
  `).get(data_inicio, data_fim),

  despesasMes: (mes, ano) => {
    const ini = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const fim = `${ano}-${String(mes).padStart(2,'0')}-31`;
    return getDB().prepare(`
      SELECT * FROM despesas_mensais
      WHERE strftime('%Y',data) = ? AND strftime('%m',data) = ?
      ORDER BY data ASC
    `).all(String(ano), String(mes).padStart(2,'0'));
  },

  lucroRealMes: (mes, ano) => {
    const m = String(mes).padStart(2,'0');
    const ini = `${ano}-${m}-01`;
    const fim = `${ano}-${m}-31`;

    // Lucro bruto das vendas (receita - CMV)
    const vendas_r = getDB().prepare(`
      SELECT
        COALESCE(SUM(iv.total),0) as receita,
        COALESCE(SUM(iv.preco_custo * iv.quantidade),0) as cmv,
        COALESCE(SUM(iv.total - (iv.preco_custo * iv.quantidade)),0) as lucro_bruto
      FROM itens_venda iv JOIN vendas v ON v.id = iv.venda_id
      WHERE v.status='concluida' AND date(v.criado_em) BETWEEN ? AND ?
    `).get(ini, fim);

    // Despesas cadastradas no mês
    const despesas_r = getDB().prepare(`
      SELECT COALESCE(SUM(valor),0) as total_despesas,
        categoria, SUM(valor) as valor
      FROM despesas_mensais
      WHERE strftime('%Y-%m', data) = ?
      GROUP BY categoria
    `).all(`${ano}-${m}`);

    const total_despesas = despesas_r.reduce((s, d) => s + d.total_despesas, 0)
      || getDB().prepare(`SELECT COALESCE(SUM(valor),0) as t FROM despesas_mensais WHERE strftime('%Y-%m',data)=?`).get(`${ano}-${m}`)?.t || 0;

    const lucro_real = (vendas_r?.lucro_bruto || 0) - total_despesas;

    return {
      mes, ano,
      receita: vendas_r?.receita || 0,
      cmv: vendas_r?.cmv || 0,
      lucro_bruto: vendas_r?.lucro_bruto || 0,
      total_despesas,
      lucro_real,
      margem_real: vendas_r?.receita > 0 ? (lucro_real / vendas_r.receita) * 100 : 0,
      despesas_por_categoria: despesas_r,
    };
  },
};

const despesas = {
  listar: (mes, ano) => {
    if (mes && ano) {
      return getDB().prepare(`SELECT * FROM despesas_mensais WHERE strftime('%Y',data)=? AND strftime('%m',data)=? ORDER BY data ASC`).all(String(ano), String(mes).padStart(2,'0'));
    }
    return getDB().prepare(`SELECT * FROM despesas_mensais ORDER BY data DESC LIMIT 200`).all();
  },
  criar: (data) => getDB().prepare(`INSERT INTO despesas_mensais (descricao,categoria,valor,data,recorrente,observacoes,usuario_id) VALUES (@descricao,@categoria,@valor,@data,@recorrente,@observacoes,@usuario_id)`).run(data),
  atualizar: (id, data) => {
    const campos = ['descricao','categoria','valor','data','recorrente','observacoes'];
    const sets = campos.filter(c => c in data).map(c => `${c}=@${c}`).join(',');
    return getDB().prepare(`UPDATE despesas_mensais SET ${sets} WHERE id=@id`).run({...data, id});
  },
  deletar: (id) => getDB().prepare(`DELETE FROM despesas_mensais WHERE id=?`).run(id),
  categorias: () => getDB().prepare(`SELECT DISTINCT categoria FROM despesas_mensais WHERE categoria IS NOT NULL ORDER BY categoria`).all(),
};

// Exporta as funções extras junto com o módulo
Object.assign(relatorios, relatoriosExtra);
module.exports.despesas = despesas;

// ============================================================
// TROCAS / DEVOLUÇÕES
// ============================================================
function gerarNumeroTroca() {
  // Usa sequência baseada no id para evitar UNIQUE constraint race condition
  const d = new Date();
  const prefix = `TRC-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  // Tenta até 10 vezes com sequência crescente segura
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const ultimo = getDB().prepare(
      `SELECT numero FROM trocas WHERE numero LIKE ? ORDER BY rowid DESC LIMIT 1`
    ).get(`${prefix}%`);
    const seq = ultimo ? parseInt(ultimo.numero.split('-')[3] || '0') + 1 : 1;
    const numero = `${prefix}-${String(seq + tentativa).padStart(4,'0')}`;
    // Verifica se já existe
    const existe = getDB().prepare(`SELECT 1 FROM trocas WHERE numero = ?`).get(numero);
    if (!existe) return numero;
  }
  // Fallback com timestamp em ms para garantir unicidade
  return `TRC-${Date.now()}`;
}

const trocas = {
  // Busca venda pelo número do cupom (validação principal)
  buscarVendaPorNumero: (numero) => {
    const venda = getDB().prepare(`
      SELECT v.*, c.nome as cliente_nome, u.nome as usuario_nome
      FROM vendas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.numero = ? AND v.status = 'concluida'
    `).get(numero);
    if (!venda) return null;
    const itens = getDB().prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(venda.id);
    const pagamentos = getDB().prepare('SELECT * FROM pagamentos_venda WHERE venda_id = ?').all(venda.id);
    return { ...venda, itens, pagamentos };
  },

  criar: ({ venda_original_id, numero_venda_original, cliente_id, usuario_id, caixa_id,
            motivo, tipo_resolucao, itens, validade_credito }) => {
    return getDB().transaction(() => {
      const numero = gerarNumeroTroca();
      const valor_total = itens.reduce((s, i) => s + i.total, 0);

      // Cria registro principal da troca
      const r = getDB().prepare(`
        INSERT INTO trocas (numero, venda_original_id, numero_venda_original, cliente_id,
          usuario_id, caixa_id, motivo, tipo_resolucao, valor_total, validade_credito)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(numero, venda_original_id||null, numero_venda_original, cliente_id||null,
             usuario_id, caixa_id||null, motivo, tipo_resolucao, valor_total,
             validade_credito||null);
      const troca_id = r.lastInsertRowid;

      // Processa cada item devolvido
      for (const item of itens) {
        getDB().prepare(`
          INSERT INTO itens_troca (troca_id, produto_id, nome_produto, quantidade,
            preco_unitario, total, condicao)
          VALUES (?,?,?,?,?,?,?)
        `).run(troca_id, item.produto_id, item.nome_produto, item.quantidade,
               item.preco_unitario, item.total, item.condicao);

        if (item.condicao === 'funcionando') {
          // Devolve ao estoque
          getDB().prepare('UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?')
            .run(item.quantidade, item.produto_id);
          getDB().prepare(`
            INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior,
              estoque_posterior, motivo, usuario_id)
            SELECT id, 'devolucao', ?, estoque_atual - ?, estoque_atual,
              'Troca/devolução ' || ?, ?
            FROM produtos WHERE id = ?
          `).run(item.quantidade, item.quantidade, numero, usuario_id, item.produto_id);
          getDB().prepare('UPDATE itens_troca SET estoque_devolvido = 1 WHERE troca_id = ? AND produto_id = ?')
            .run(troca_id, item.produto_id);
        } else {
          // Produto com defeito — registra na aba de defeitos (NÃO volta ao estoque)
          getDB().prepare(`
            INSERT INTO produtos_defeito (produto_id, nome_produto, troca_id, cliente_id,
              quantidade, motivo)
            VALUES (?,?,?,?,?,?)
          `).run(item.produto_id, item.nome_produto, troca_id, cliente_id||null,
                 item.quantidade, motivo);
          // Abate do estoque (produto saiu mas tá com defeito, não retorna)
          getDB().prepare(`
            INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior,
              estoque_posterior, motivo, usuario_id)
            SELECT id, 'perda', ?, estoque_atual, estoque_atual,
              'Defeito - Troca ' || ?, ?
            FROM produtos WHERE id = ?
          `).run(item.quantidade, numero, usuario_id, item.produto_id);
        }
      }

      // Resolução financeira
      if (tipo_resolucao === 'carta_credito' && cliente_id) {
        const validade = validade_credito ||
          new Date(Date.now() + 90*86400000).toISOString().slice(0,10);
        const vcod = 'VCH-' + String(troca_id).padStart(4,'0') + '-' + Math.random().toString(36).substring(2,8).toUpperCase();
        const cr = getDB().prepare(`
          INSERT INTO creditos_cliente (cliente_id, valor_original, valor_disponivel,
            origem, validade, troca_id, voucher_codigo, voucher_usado)
          VALUES (?,?,?,'troca',?,?,?,0)
        `).run(cliente_id, valor_total, valor_total, validade, troca_id, vcod);
        getDB().prepare('UPDATE trocas SET credito_id = ? WHERE id = ?')
          .run(cr.lastInsertRowid, troca_id);

      } else if (tipo_resolucao === 'extorno') {
        // Abate das vendas do caixa (não é sangria — é extorno)
        if (caixa_id) {
          getDB().prepare(`
            INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, motivo, usuario_id)
            VALUES (?, 'sangria', ?, ?, ?)
          `).run(caixa_id, valor_total, `Extorno troca ${numero}`, usuario_id);
        }
      }

      return { troca_id, numero, valor_total };
    })();
  },

  buscar: (id) => {
    const troca = getDB().prepare(`
      SELECT t.*, c.nome as cliente_nome, u.nome as usuario_nome,
        v.numero as numero_venda
      FROM trocas t
      LEFT JOIN clientes c ON t.cliente_id = c.id
      LEFT JOIN usuarios u ON t.usuario_id = u.id
      LEFT JOIN vendas v ON t.venda_original_id = v.id
      WHERE t.id = ?
    `).get(id);
    if (!troca) return null;
    const itens = getDB().prepare('SELECT * FROM itens_troca WHERE troca_id = ?').all(id);
    const credito = troca.credito_id
      ? getDB().prepare('SELECT * FROM creditos_cliente WHERE id = ?').get(troca.credito_id)
      : null;
    return { ...troca, itens, credito };
  },

  listar: ({ data_inicio, data_fim, cliente_id, tipo_resolucao, limite = 100 } = {}) => {
    let sql = `
      SELECT t.*, c.nome as cliente_nome, u.nome as usuario_nome
      FROM trocas t
      LEFT JOIN clientes c ON t.cliente_id = c.id
      LEFT JOIN usuarios u ON t.usuario_id = u.id
      WHERE 1=1
    `;
    const p = {};
    if (data_inicio) { sql += ' AND date(t.criado_em) >= @di'; p.di = data_inicio; }
    if (data_fim)    { sql += ' AND date(t.criado_em) <= @df'; p.df = data_fim; }
    if (cliente_id)  { sql += ' AND t.cliente_id = @cliente_id'; p.cliente_id = cliente_id; }
    if (tipo_resolucao) { sql += ' AND t.tipo_resolucao = @tipo_resolucao'; p.tipo_resolucao = tipo_resolucao; }
    sql += ' ORDER BY t.criado_em DESC LIMIT @limite';
    p.limite = limite;
    return getDB().prepare(sql).all(p);
  },

  marcarExtornoAssinado: (troca_id) => {
    getDB().prepare('UPDATE trocas SET extorno_assinado = 1 WHERE id = ?').run(troca_id);
    return true;
  },

  // Produtos com defeito
  listarDefeitos: ({ status } = {}) => {
    let sql = `
      SELECT d.*, p.nome as produto_nome, c.nome as cliente_nome
      FROM produtos_defeito d
      LEFT JOIN produtos p ON d.produto_id = p.id
      LEFT JOIN clientes c ON d.cliente_id = c.id
      WHERE 1=1
    `;
    const params = {};
    if (status) { sql += ' AND d.status = @status'; params.status = status; }
    sql += ' ORDER BY d.criado_em DESC';
    return getDB().prepare(sql).all(params);
  },

  atualizarStatusDefeito: (id, status, observacoes) => {
    const resolvido = status === 'resolvido' ? "datetime('now','localtime')" : 'NULL';
    getDB().prepare(`
      UPDATE produtos_defeito
      SET status = ?, observacoes = COALESCE(@obs, observacoes),
          resolvido_em = ${resolvido}
      WHERE id = ?
    `).run(status, id);
    return true;
  },

  // Créditos do cliente
  creditosCliente: (cliente_id) => {
    return getDB().prepare(`
      SELECT * FROM creditos_cliente
      WHERE cliente_id = ? AND ativo = 1 AND valor_disponivel > 0
        AND (validade IS NULL OR validade >= date('now','localtime'))
      ORDER BY criado_em ASC
    `).all(cliente_id);
  },

  buscarVoucher: (codigo) => {
    return getDB().prepare(`
      SELECT c.*, cl.nome as cliente_nome
      FROM creditos_cliente c
      LEFT JOIN clientes cl ON c.cliente_id = cl.id
      WHERE c.voucher_codigo = ? AND c.ativo = 1 AND c.voucher_usado = 0 AND c.valor_disponivel > 0
        AND (c.validade IS NULL OR c.validade >= date('now','localtime'))
    `).get(codigo);
  },

  usarVoucher: (codigo, valor_usar, venda_id) => {
    const cred = getDB().prepare(`SELECT * FROM creditos_cliente WHERE voucher_codigo = ? AND ativo = 1 AND voucher_usado = 0`).get(codigo);
    if (!cred) throw new Error('Voucher inválido ou já utilizado');
    if (cred.valor_disponivel < valor_usar - 0.01) throw new Error('Saldo insuficiente no voucher');
    return getDB().transaction(() => {
      getDB().prepare('INSERT INTO uso_creditos (credito_id, venda_id, valor_usado) VALUES (?,?,?)').run(cred.id, venda_id||null, valor_usar);
      const novo = Math.max(0, cred.valor_disponivel - valor_usar);
      getDB().prepare(`UPDATE creditos_cliente SET valor_disponivel=?, ativo=?, voucher_usado=1, atualizado_em=datetime('now','localtime') WHERE id=?`).run(novo, 0, cred.id);
      return { saldo_restante: novo, cliente_nome: cred.cliente_nome };
    })();
  },

  usarCredito: (credito_id, valor_usar, venda_id) => {
    const cred = getDB().prepare('SELECT * FROM creditos_cliente WHERE id = ?').get(credito_id);
    if (!cred || cred.valor_disponivel < valor_usar) throw new Error('Saldo insuficiente');
    return getDB().transaction(() => {
      getDB().prepare('INSERT INTO uso_creditos (credito_id, venda_id, valor_usado) VALUES (?,?,?)')
        .run(credito_id, venda_id, valor_usar);
      const novo = cred.valor_disponivel - valor_usar;
      getDB().prepare(`UPDATE creditos_cliente SET valor_disponivel = ?, ativo = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`)
        .run(novo, novo > 0 ? 1 : 0, credito_id);
      return { saldo_restante: novo };
    })();
  },
};

module.exports.trocas = trocas;

// ============================================================
// FORNECEDORES
// ============================================================
const fornecedores = {
  listar: (filtro) => {
    let q = `SELECT * FROM fornecedores WHERE 1=1`;
    const p = [];
    if (filtro?.busca) { q += ` AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)`; const b = `%${filtro.busca}%`; p.push(b,b,b); }
    if (filtro?.ativo !== undefined) { q += ` AND ativo = ?`; p.push(filtro.ativo); }
    q += ` ORDER BY razao_social ASC`;
    return getDB().prepare(q).all(...p);
  },
  buscarPorId: (id) => getDB().prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(id),
  criar: (d) => {
    const r = getDB().prepare(`
      INSERT INTO fornecedores (razao_social,nome_fantasia,tipo_pessoa,cnpj,cpf,inscricao_estadual,
        email,telefone,celular,cep,logradouro,numero,complemento,bairro,cidade,estado,
        contato_nome,prazo_pagamento,observacoes,ativo)
      VALUES (@razao_social,@nome_fantasia,@tipo_pessoa,@cnpj,@cpf,@inscricao_estadual,
        @email,@telefone,@celular,@cep,@logradouro,@numero,@complemento,@bairro,@cidade,@estado,
        @contato_nome,@prazo_pagamento,@observacoes,1)
    `).run(d);
    return getDB().prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(r.lastInsertRowid);
  },
  atualizar: (id, d) => {
    const campos = ['razao_social','nome_fantasia','tipo_pessoa','cnpj','cpf','inscricao_estadual',
      'email','telefone','celular','cep','logradouro','numero','complemento','bairro','cidade','estado',
      'contato_nome','prazo_pagamento','observacoes','ativo'];
    const sets = campos.filter(c => d[c] !== undefined).map(c => `${c}=@${c}`).join(',');
    if (!sets) return;
    getDB().prepare(`UPDATE fornecedores SET ${sets}, atualizado_em=datetime('now','localtime') WHERE id=@id`).run({...d, id});
    return getDB().prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(id);
  },
  deletar: (id) => {
    const emUso = getDB().prepare(`SELECT COUNT(*) as n FROM compras WHERE fornecedor_id = ?`).get(id);
    if (emUso.n > 0) throw new Error('Fornecedor possui compras vinculadas e não pode ser excluído');
    return getDB().prepare(`UPDATE fornecedores SET ativo = 0 WHERE id = ?`).run(id);
  },
};
module.exports.fornecedores = fornecedores;

// ============================================================
// COMPRAS
// ============================================================
function gerarNumeroCompra() {
  const hoje = new Date();
  const data = `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}`;
  const ultima = getDB().prepare(`SELECT numero FROM compras WHERE numero LIKE ? ORDER BY rowid DESC LIMIT 1`).get(`CMP-${data}-%`);
  const seq = ultima ? parseInt(ultima.numero.split('-')[2]) + 1 : 1;
  return `CMP-${data}-${String(seq).padStart(4,'0')}`;
}

const compras = {
  listar: (filtro) => {
    let q = `
      SELECT c.*, f.razao_social as fornecedor_nome, f.nome_fantasia
      FROM compras c
      LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
      WHERE 1=1
    `;
    const p = [];
    if (filtro?.fornecedor_id) { q += ` AND c.fornecedor_id = ?`; p.push(filtro.fornecedor_id); }
    if (filtro?.status)        { q += ` AND c.status = ?`;        p.push(filtro.status); }
    if (filtro?.inicio)        { q += ` AND c.data_recebimento >= ?`; p.push(filtro.inicio); }
    if (filtro?.fim)           { q += ` AND c.data_recebimento <= ?`; p.push(filtro.fim); }
    q += ` ORDER BY c.criado_em DESC LIMIT 500`;
    return getDB().prepare(q).all(...p);
  },

  buscar: (id) => getDB().prepare(`
    SELECT c.*, f.razao_social as fornecedor_nome
    FROM compras c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
    WHERE c.id = ?
  `).get(id),

  itens: (compra_id) => getDB().prepare(`
    SELECT ic.*, p.codigo_barras, p.estoque_atual
    FROM itens_compra ic
    LEFT JOIN produtos p ON p.id = ic.produto_id
    WHERE ic.compra_id = ?
  `).all(compra_id),

  criar: (d) => {
    const { itens, ...compra } = d;
    if (!itens || itens.length === 0) throw new Error('Compra deve ter pelo menos um item');

    return getDB().transaction(() => {
      const numero = gerarNumeroCompra();
      const subtotal = itens.reduce((s, i) => s + i.total, 0);
      const total = subtotal - (compra.desconto_valor || 0) + (compra.frete || 0) + (compra.outras_despesas || 0);

      const r = getDB().prepare(`
        INSERT INTO compras (numero,fornecedor_id,usuario_id,status,numero_nf,data_emissao,
          data_recebimento,subtotal,desconto_valor,frete,outras_despesas,total,
          condicao_pagamento,forma_pagamento,observacoes)
        VALUES (@numero,@fornecedor_id,@usuario_id,@status,@numero_nf,@data_emissao,
          @data_recebimento,@subtotal,@desconto_valor,@frete,@outras_despesas,@total,
          @condicao_pagamento,@forma_pagamento,@observacoes)
      `).run({ numero, subtotal, total, ...compra,
        status: compra.status || 'recebida',
        desconto_valor: compra.desconto_valor || 0,
        frete: compra.frete || 0,
        outras_despesas: compra.outras_despesas || 0,
      });
      const compra_id = r.lastInsertRowid;

      const insertItem = getDB().prepare(`
        INSERT INTO itens_compra (compra_id,produto_id,nome_produto,quantidade,preco_unitario,total)
        VALUES (@compra_id,@produto_id,@nome_produto,@quantidade,@preco_unitario,@total)
      `);

      // Atualiza estoque e custo de cada produto
      for (const item of itens) {
        insertItem.run({ compra_id, ...item });

        // Atualiza estoque
        const prod = getDB().prepare(`SELECT estoque_atual, preco_custo FROM produtos WHERE id = ?`).get(item.produto_id);
        if (!prod) continue;
        const novoEstoque = (prod.estoque_atual || 0) + item.quantidade;

        // Custo médio ponderado
        const estoqueAtual = prod.estoque_atual || 0;
        const custoAtual = prod.preco_custo || 0;
        const novoCusto = estoqueAtual <= 0
          ? item.preco_unitario
          : ((estoqueAtual * custoAtual) + (item.quantidade * item.preco_unitario)) / (estoqueAtual + item.quantidade);

        getDB().prepare(`
          UPDATE produtos SET
            estoque_atual = ?,
            preco_custo = ?,
            atualizado_em = datetime('now','localtime')
          WHERE id = ?
        `).run(novoEstoque, Number(novoCusto.toFixed(4)), item.produto_id);

        // Registra movimentação
        getDB().prepare(`
          INSERT INTO movimentacoes_estoque
            (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, preco_custo, motivo, documento_ref, usuario_id)
          VALUES (?, 'entrada', ?, ?, ?, ?, 'Compra', ?, ?)
        `).run(item.produto_id, item.quantidade, prod.estoque_atual, novoEstoque, item.preco_unitario, numero, compra.usuario_id || null);
      }

      return { id: compra_id, numero };
    })();
  },

  cancelar: (id, motivo, usuario_id) => {
    return getDB().transaction(() => {
      const compra = getDB().prepare(`SELECT * FROM compras WHERE id = ?`).get(id);
      if (!compra) throw new Error('Compra não encontrada');
      if (compra.status === 'cancelada') throw new Error('Compra já está cancelada');

      const itens = getDB().prepare(`SELECT * FROM itens_compra WHERE compra_id = ?`).all(id);

      // Estorna estoque
      for (const item of itens) {
        const prod = getDB().prepare(`SELECT estoque_atual FROM produtos WHERE id = ?`).get(item.produto_id);
        if (!prod) continue;
        const novoEstoque = Math.max(0, (prod.estoque_atual || 0) - item.quantidade);
        getDB().prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(novoEstoque, item.produto_id);
        getDB().prepare(`
          INSERT INTO movimentacoes_estoque
            (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, documento_ref, usuario_id)
          VALUES (?, 'saida', ?, ?, ?, ?, ?, ?)
        `).run(item.produto_id, item.quantidade, prod.estoque_atual, novoEstoque, motivo || 'Cancelamento de compra', compra.numero, usuario_id || null);
      }

      getDB().prepare(`UPDATE compras SET status = 'cancelada' WHERE id = ?`).run(id);
      return { ok: true };
    })();
  },

  resumo: (inicio, fim) => {
    const filtro = inicio && fim
      ? `WHERE c.data_recebimento BETWEEN '${inicio}' AND '${fim}' AND c.status != 'cancelada'`
      : `WHERE c.status != 'cancelada'`;
    return getDB().prepare(`
      SELECT
        COUNT(*) as total_compras,
        SUM(c.total) as valor_total,
        COUNT(DISTINCT c.fornecedor_id) as total_fornecedores
      FROM compras c ${filtro}
    `).get();
  },
};
module.exports.compras = compras;

// ============================================================
// REPRESENTANTES
// ============================================================
const representantes = {
  listar: (filtro) => {
    let q = `SELECT * FROM representantes WHERE 1=1`;
    const p = [];
    if (filtro?.busca) { q += ` AND (nome LIKE ? OR cpf LIKE ?)`; const b = `%${filtro.busca}%`; p.push(b,b); }
    if (filtro?.ativo !== undefined) { q += ` AND ativo = ?`; p.push(filtro.ativo); }
    q += ` ORDER BY nome ASC`;
    return getDB().prepare(q).all(...p);
  },
  buscarPorId: (id) => getDB().prepare(`SELECT * FROM representantes WHERE id = ?`).get(id),
  criar: (d) => {
    const r = getDB().prepare(`
      INSERT INTO representantes (nome,cpf,email,telefone,celular,cep,logradouro,numero,
        complemento,bairro,cidade,estado,perc_comissao,observacoes,ativo)
      VALUES (@nome,@cpf,@email,@telefone,@celular,@cep,@logradouro,@numero,
        @complemento,@bairro,@cidade,@estado,@perc_comissao,@observacoes,1)
    `).run(d);
    return getDB().prepare(`SELECT * FROM representantes WHERE id = ?`).get(r.lastInsertRowid);
  },
  atualizar: (id, d) => {
    const campos = ['nome','cpf','email','telefone','celular','cep','logradouro','numero',
      'complemento','bairro','cidade','estado','perc_comissao','observacoes','ativo'];
    const sets = campos.filter(c => d[c] !== undefined).map(c => `${c}=@${c}`).join(',');
    if (!sets) return;
    getDB().prepare(`UPDATE representantes SET ${sets}, atualizado_em=datetime('now','localtime') WHERE id=@id`).run({...d, id});
    return getDB().prepare(`SELECT * FROM representantes WHERE id = ?`).get(id);
  },
  deletar: (id) => {
    const emUso = getDB().prepare(`SELECT COUNT(*) as n FROM comissoes WHERE representante_id = ?`).get(id);
    if (emUso.n > 0) throw new Error('Representante possui comissões vinculadas. Desative-o em vez de excluir.');
    return getDB().prepare(`UPDATE representantes SET ativo = 0 WHERE id = ?`).run(id);
  },
};
module.exports.representantes = representantes;

// ============================================================
// COMISSÕES
// ============================================================
const comissoes = {
  // Gera comissão ao registrar uma venda com representante
  gerarParaVenda: (venda_id, representante_id) => {
    const venda = getDB().prepare(`SELECT * FROM vendas WHERE id = ?`).get(venda_id);
    const rep   = getDB().prepare(`SELECT * FROM representantes WHERE id = ?`).get(representante_id);
    if (!venda || !rep) throw new Error('Venda ou representante não encontrado');
    const existente = getDB().prepare(`SELECT id FROM comissoes WHERE venda_id = ? AND representante_id = ?`).get(venda_id, representante_id);
    if (existente) return existente;
    const valor_comissao = Number(((venda.total * rep.perc_comissao) / 100).toFixed(2));
    const r = getDB().prepare(`
      INSERT INTO comissoes (representante_id, venda_id, valor_venda, perc_comissao, valor_comissao, status)
      VALUES (?, ?, ?, ?, ?, 'pendente')
    `).run(representante_id, venda_id, venda.total, rep.perc_comissao, valor_comissao);
    return getDB().prepare(`SELECT * FROM comissoes WHERE id = ?`).get(r.lastInsertRowid);
  },

  listar: (filtro) => {
    let q = `
      SELECT c.*, r.nome as representante_nome, r.perc_comissao as perc_rep,
             v.numero as numero_venda, v.criado_em as data_venda
      FROM comissoes c
      JOIN representantes r ON r.id = c.representante_id
      JOIN vendas v ON v.id = c.venda_id
      WHERE 1=1
    `;
    const p = [];
    if (filtro?.representante_id) { q += ` AND c.representante_id = ?`; p.push(filtro.representante_id); }
    if (filtro?.status)            { q += ` AND c.status = ?`;           p.push(filtro.status); }
    if (filtro?.inicio)            { q += ` AND v.criado_em >= ?`;       p.push(filtro.inicio); }
    if (filtro?.fim)               { q += ` AND v.criado_em <= ?`;       p.push(filtro.fim + ' 23:59:59'); }
    q += ` ORDER BY c.criado_em DESC LIMIT 1000`;
    return getDB().prepare(q).all(...p);
  },

  pagar: (ids, data_pagamento) => {
    return getDB().transaction(() => {
      const stmt = getDB().prepare(`UPDATE comissoes SET status='paga', data_pagamento=? WHERE id=? AND status='pendente'`);
      let pagas = 0;
      for (const id of ids) {
        const r = stmt.run(data_pagamento || new Date().toISOString().split('T')[0], id);
        pagas += r.changes;
      }
      return { pagas };
    })();
  },

  resumoPorRepresentante: (inicio, fim) => {
    const where = inicio && fim
      ? `AND v.criado_em BETWEEN '${inicio}' AND '${fim} 23:59:59'`
      : '';
    return getDB().prepare(`
      SELECT r.id, r.nome, r.perc_comissao,
        COUNT(c.id) as total_vendas,
        COALESCE(SUM(c.valor_venda), 0) as total_vendido,
        COALESCE(SUM(c.valor_comissao), 0) as total_comissao,
        COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.valor_comissao ELSE 0 END), 0) as comissao_pendente,
        COALESCE(SUM(CASE WHEN c.status='paga'     THEN c.valor_comissao ELSE 0 END), 0) as comissao_paga
      FROM representantes r
      LEFT JOIN comissoes c ON c.representante_id = r.id
      LEFT JOIN vendas v ON v.id = c.venda_id AND c.id IS NOT NULL
      WHERE r.ativo = 1 ${where}
      GROUP BY r.id
      ORDER BY total_vendido DESC
    `).all();
  },
};
module.exports.comissoes = comissoes;

// ============================================================
// E-COMMERCE — Pedidos Online (SEPARADO do PDV)
// ============================================================

// Cria tabela de pedidos online se não existir (migration segura)
function initEcommerceTables() {
  getDB().exec(`
    CREATE TABLE IF NOT EXISTS pedidos_online (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE NOT NULL,
      -- Origem Supabase
      supabase_id TEXT UNIQUE,
      -- Cliente
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      cliente_email TEXT,
      -- Entrega
      tipo_entrega TEXT NOT NULL DEFAULT 'retirada' CHECK(tipo_entrega IN ('retirada','entrega')),
      endereco_bairro TEXT,
      endereco_rua TEXT,
      endereco_numero TEXT,
      endereco_complemento TEXT,
      -- Valores
      subtotal REAL NOT NULL DEFAULT 0,
      frete REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      -- Status
      status TEXT DEFAULT 'recebido' CHECK(status IN (
        'recebido','confirmado','em_preparo','saiu','entregue',
        'pronto_retirada','retirado','cancelado'
      )),
      observacoes TEXT,
      -- Controle
      origem TEXT DEFAULT 'web',
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_online_status ON pedidos_online(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_online_data ON pedidos_online(criado_em);

    CREATE TABLE IF NOT EXISTS itens_pedido_online (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos_online(id) ON DELETE CASCADE,
      produto_id INTEGER REFERENCES produtos(id),
      nome_produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL,
      total REAL NOT NULL
    );
  `);
}

function gerarNumeroPedidoOnline() {
  const hoje = new Date();
  const data = `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}`;
  const ultima = getDB().prepare(`SELECT numero FROM pedidos_online WHERE numero LIKE ? ORDER BY rowid DESC LIMIT 1`).get(`WEB-${data}-%`);
  const seq = ultima ? parseInt(ultima.numero.split('-')[2]) + 1 : 1;
  return `WEB-${data}-${String(seq).padStart(4,'0')}`;
}

const pedidosOnline = {
  listar: (filtro = {}) => {
    initEcommerceTables();
    let q = `SELECT * FROM pedidos_online WHERE 1=1`;
    const p = [];
    if (filtro.status)  { q += ` AND status = ?`;              p.push(filtro.status); }
    if (filtro.inicio)  { q += ` AND date(criado_em) >= ?`;    p.push(filtro.inicio); }
    if (filtro.fim)     { q += ` AND date(criado_em) <= ?`;    p.push(filtro.fim); }
    if (filtro.busca)   {
      q += ` AND (cliente_nome LIKE ? OR cliente_telefone LIKE ? OR numero LIKE ?)`;
      const b = `%${filtro.busca}%`; p.push(b, b, b);
    }
    q += ` ORDER BY criado_em DESC LIMIT 500`;
    return getDB().prepare(q).all(...p);
  },

  buscar: (id) => {
    initEcommerceTables();
    return getDB().prepare(`SELECT * FROM pedidos_online WHERE id = ?`).get(id);
  },

  itens: (pedido_id) => {
    initEcommerceTables();
    return getDB().prepare(`SELECT * FROM itens_pedido_online WHERE pedido_id = ?`).all(pedido_id);
  },

  // Importa pedido vindo do Supabase
  importarDoSupabase: (pedido) => {
    initEcommerceTables();
    return getDB().transaction(() => {
      const existente = pedido.supabase_id
        ? getDB().prepare(`SELECT id FROM pedidos_online WHERE supabase_id = ?`).get(pedido.supabase_id)
        : null;
      if (existente) {
        // Só atualiza status
        getDB().prepare(`UPDATE pedidos_online SET status = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`)
          .run(pedido.status || 'recebido', existente.id);
        return { id: existente.id, novo: false };
      }
      const numero = pedido.numero || gerarNumeroPedidoOnline();
      const r = getDB().prepare(`
        INSERT INTO pedidos_online
          (numero, supabase_id, cliente_nome, cliente_telefone, cliente_email,
           tipo_entrega, endereco_bairro, endereco_rua, endereco_numero, endereco_complemento,
           subtotal, frete, total, status, observacoes, origem)
        VALUES
          (@numero,@supabase_id,@cliente_nome,@cliente_telefone,@cliente_email,
           @tipo_entrega,@endereco_bairro,@endereco_rua,@endereco_numero,@endereco_complemento,
           @subtotal,@frete,@total,@status,@observacoes,@origem)
      `).run({
        numero,
        supabase_id:          pedido.supabase_id || null,
        cliente_nome:         pedido.cliente_nome,
        cliente_telefone:     pedido.cliente_telefone,
        cliente_email:        pedido.cliente_email || null,
        tipo_entrega:         pedido.tipo_entrega || 'retirada',
        endereco_bairro:      pedido.endereco_bairro || null,
        endereco_rua:         pedido.endereco_rua || null,
        endereco_numero:      pedido.endereco_numero || null,
        endereco_complemento: pedido.endereco_complemento || null,
        subtotal:             pedido.subtotal || 0,
        frete:                pedido.frete || 0,
        total:                pedido.total || 0,
        status:               pedido.status || 'recebido',
        observacoes:          pedido.observacoes || null,
        origem:               'web',
      });
      const pedido_id = r.lastInsertRowid;

      // Insere itens
      if (pedido.itens && pedido.itens.length > 0) {
        const stmtItem = getDB().prepare(`
          INSERT INTO itens_pedido_online (pedido_id, produto_id, nome_produto, quantidade, preco_unitario, total)
          VALUES (@pedido_id, @produto_id, @nome_produto, @quantidade, @preco_unitario, @total)
        `);
        for (const item of pedido.itens) {
          // Tenta encontrar produto local pelo astia_produto_id
          const prod = item.astia_produto_id
            ? getDB().prepare(`SELECT id FROM produtos WHERE id = ?`).get(item.astia_produto_id)
            : null;
          stmtItem.run({
            pedido_id,
            produto_id:     prod?.id || null,
            nome_produto:   item.nome_produto,
            quantidade:     item.quantidade,
            preco_unitario: item.preco_unitario,
            total:          item.total,
          });
        }
      }
      return { id: pedido_id, numero, novo: true };
    })();
  },

  atualizarStatus: (id, status) => {
    initEcommerceTables();
    getDB().prepare(`UPDATE pedidos_online SET status = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(status, id);
    return getDB().prepare(`SELECT * FROM pedidos_online WHERE id = ?`).get(id);
  },

  // Relatório exclusivo e-commerce — NUNCA mistura com PDV
  relatorio: (inicio, fim) => {
    initEcommerceTables();
    const where = inicio && fim
      ? `WHERE date(p.criado_em) BETWEEN '${inicio}' AND '${fim}'`
      : `WHERE 1=1`;
    return {
      resumo: getDB().prepare(`
        SELECT
          COUNT(*) as total_pedidos,
          COUNT(CASE WHEN status NOT IN ('cancelado') THEN 1 END) as pedidos_ativos,
          COUNT(CASE WHEN status = 'cancelado' THEN 1 END) as pedidos_cancelados,
          COUNT(CASE WHEN tipo_entrega = 'retirada' THEN 1 END) as retiradas,
          COUNT(CASE WHEN tipo_entrega = 'entrega' THEN 1 END) as entregas,
          COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN subtotal END), 0) as receita_produtos,
          COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN frete END), 0) as receita_frete,
          COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN total END), 0) as receita_total,
          COUNT(DISTINCT cliente_telefone) as clientes_unicos
        FROM pedidos_online p ${where}
      `).get(),
      por_status: getDB().prepare(`
        SELECT status, COUNT(*) as qtd, COALESCE(SUM(total),0) as valor
        FROM pedidos_online p ${where}
        GROUP BY status ORDER BY qtd DESC
      `).all(),
      por_dia: getDB().prepare(`
        SELECT date(p.criado_em) as data,
          COUNT(*) as pedidos,
          COALESCE(SUM(CASE WHEN status != 'cancelado' THEN total END),0) as receita
        FROM pedidos_online p ${where}
        GROUP BY date(p.criado_em) ORDER BY data ASC
      `).all(),
      top_produtos: getDB().prepare(`
        SELECT i.nome_produto,
          SUM(i.quantidade) as qtd_vendida,
          SUM(i.total) as receita
        FROM itens_pedido_online i
        JOIN pedidos_online p ON p.id = i.pedido_id
        ${where.replace('p.criado_em', 'p.criado_em')}
        AND p.status != 'cancelado'
        GROUP BY i.nome_produto
        ORDER BY qtd_vendida DESC LIMIT 20
      `).all(),
    };
  },

  // Produtos marcados para online
  produtosOnline: (filtro = {}) => {
    let q = `SELECT p.*, c.nome as categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.online_ativo = 1 AND p.ativo = 1`;
    if (filtro.busca) { q += ` AND p.nome LIKE ?`; }
    q += ` ORDER BY p.online_destaque DESC, p.nome ASC`;
    const params = filtro.busca ? [`%${filtro.busca}%`] : [];
    return getDB().prepare(q).all(...params);
  },

  marcarProduto: (produto_id, dados) => {
    const campos = ['online_ativo','online_descricao','online_foto_url','online_destaque'];
    const sets = campos.filter(c => dados[c] !== undefined).map(c => `${c}=@${c}`).join(',');
    if (!sets) return;
    getDB().prepare(`UPDATE produtos SET ${sets} WHERE id = @id`).run({ ...dados, id: produto_id });
  },
};
module.exports.pedidosOnline = pedidosOnline;

// ============================================================
// FLYERS & PROMOÇÕES
// ============================================================
const flyers = {

  // Produtos perto da validade (até N dias)
  perto_validade: (dias = 7) => {
    return getDB().prepare(`
      SELECT p.id, p.nome, p.preco_venda, p.estoque_atual,
             p.data_validade, p.online_foto_url, p.unidade_medida as unidade,
             c.nome as categoria_nome,
             julianday(p.data_validade) - julianday('now','localtime') as dias_para_vencer
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.ativo = 1
        AND p.data_validade IS NOT NULL
        AND p.data_validade != ''
        AND julianday(p.data_validade) - julianday('now','localtime') <= ?
        AND julianday(p.data_validade) - julianday('now','localtime') >= 0
      ORDER BY dias_para_vencer ASC
      LIMIT 20
    `).all(dias);
  },

  // Produtos com estoque alto (encalhados)
  estoque_alto: (minimo = 20) => {
    return getDB().prepare(`
      SELECT p.id, p.nome, p.preco_venda, p.estoque_atual,
             p.data_validade, p.online_foto_url, p.unidade_medida as unidade,
             c.nome as categoria_nome
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.ativo = 1 AND p.estoque_atual >= ?
      ORDER BY p.estoque_atual DESC
      LIMIT 20
    `).all(minimo);
  },

  // Busca produtos para o flyer
  buscar: (busca = '') => {
    const q = `%${busca}%`;
    return getDB().prepare(`
      SELECT p.id, p.nome, p.preco_venda, p.estoque_atual,
             p.data_validade, p.online_foto_url, p.unidade_medida as unidade,
             c.nome as categoria_nome
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.ativo = 1
        AND (p.nome LIKE ? OR p.codigo_barras LIKE ? OR c.nome LIKE ?)
      ORDER BY p.nome ASC
      LIMIT 40
    `).all(q, q, q);
  },

  // Lista todos produtos ativos para seleção no flyer (sem filtro de estoque)
  listarTodos: () => {
    return getDB().prepare(`
      SELECT p.id, p.nome, p.preco_venda, p.estoque_atual,
             p.data_validade, p.online_foto_url, p.unidade_medida as unidade,
             c.nome as categoria_nome
      FROM produtos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.ativo = 1
      ORDER BY p.nome ASC
      LIMIT 200
    `).all();
  },

  // Salva histórico de flyer gerado
  salvar: (dados) => {
    getDB().exec(`
      CREATE TABLE IF NOT EXISTS flyers_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template TEXT NOT NULL,
        titulo TEXT,
        produtos_ids TEXT,
        config TEXT,
        criado_em TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    return getDB().prepare(`
      INSERT INTO flyers_historico (template, titulo, produtos_ids, config)
      VALUES (?, ?, ?, ?)
    `).run(dados.template, dados.titulo, JSON.stringify(dados.produtos_ids), JSON.stringify(dados.config));
  },
};
module.exports.flyers = flyers;

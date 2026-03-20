-- ============================================================
-- VYN CRM - Schema SQLite Completo v2.0
-- ============================================================
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';

-- ============================================================
-- CONFIG DA LOJA
-- ============================================================
CREATE TABLE IF NOT EXISTS config_loja (
  id INTEGER PRIMARY KEY DEFAULT 1,
  nome TEXT NOT NULL DEFAULT 'Minha Loja',
  razao_social TEXT,
  cnpj TEXT,
  cpf TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  regime_tributario TEXT DEFAULT 'simples_nacional',
  cep TEXT, logradouro TEXT, numero TEXT,
  complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT DEFAULT 'SP',
  telefone TEXT, email TEXT, site TEXT, logo_path TEXT,
  -- Fiscal
  certificado_digital_path TEXT,
  certificado_senha TEXT,
  ambiente_nfe TEXT DEFAULT 'homologacao',
  serie_nfe INTEGER DEFAULT 1, ultimo_numero_nfe INTEGER DEFAULT 0,
  serie_nfce INTEGER DEFAULT 1, ultimo_numero_nfce INTEGER DEFAULT 0,
  -- PDV
  pdv_tamanho_fonte TEXT DEFAULT 'medio',
  pdv_impressora TEXT, pdv_largura_papel TEXT DEFAULT '80mm',
  -- Licença
  chave_licenca TEXT, plano TEXT DEFAULT 'basico', validade_licenca TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO config_loja (id, nome) VALUES (1, 'Minha Loja');

-- ============================================================
-- USUÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  cargo TEXT DEFAULT 'vendedor' CHECK(cargo IN ('admin','gerente','vendedor','caixa')),
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
-- Admin criado via db.js na inicialização

-- ============================================================
-- CATEGORIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#6366f1',
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- PRODUTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  codigo_barras TEXT,
  sku TEXT,
  categoria_id INTEGER REFERENCES categorias(id),
  preco_custo REAL DEFAULT 0,
  preco_venda REAL NOT NULL DEFAULT 0,
  -- NCM, CFOP e fiscal
  ncm TEXT,
  cfop TEXT DEFAULT '5102',
  cst_icms TEXT DEFAULT '400',
  cst_pis TEXT DEFAULT '07',
  cst_cofins TEXT DEFAULT '07',
  aliquota_icms REAL DEFAULT 0,
  aliquota_pis REAL DEFAULT 0.65,
  aliquota_cofins REAL DEFAULT 3,
  unidade_medida TEXT DEFAULT 'UN',
  origem_produto INTEGER DEFAULT 0,
  -- Estoque
  estoque_atual REAL DEFAULT 0,
  estoque_minimo REAL DEFAULT 5,
  estoque_maximo REAL DEFAULT 1000,
  localizacao TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);

-- ============================================================
-- MOVIMENTAÇÕES DE ESTOQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida','ajuste','inventario','devolucao','perda')),
  quantidade REAL NOT NULL,
  estoque_anterior REAL NOT NULL,
  estoque_posterior REAL NOT NULL,
  preco_custo REAL,
  motivo TEXT,
  documento_ref TEXT,
  venda_id INTEGER,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo_pessoa TEXT DEFAULT 'F' CHECK(tipo_pessoa IN ('F','J')),
  cpf TEXT, cnpj TEXT, rg TEXT, data_nascimento TEXT,
  email TEXT, telefone TEXT, celular TEXT, whatsapp TEXT,
  cep TEXT, logradouro TEXT, numero TEXT,
  complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  inscricao_estadual TEXT,
  contribuinte_icms INTEGER DEFAULT 0,
  limite_credito REAL DEFAULT 0,
  pontos_fidelidade INTEGER DEFAULT 0,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);

-- ============================================================
-- CAIXA
-- ============================================================
CREATE TABLE IF NOT EXISTS caixas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_pdv INTEGER DEFAULT 1,
  usuario_id INTEGER REFERENCES usuarios(id),
  status TEXT DEFAULT 'aberto' CHECK(status IN ('aberto','fechado')),
  data_abertura TEXT DEFAULT (datetime('now','localtime')),
  saldo_abertura REAL DEFAULT 0,
  observacao_abertura TEXT,
  data_fechamento TEXT,
  saldo_esperado REAL DEFAULT 0,
  saldo_informado REAL DEFAULT 0,
  diferenca REAL DEFAULT 0,
  observacao_fechamento TEXT,
  usuario_fechamento_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caixa_id INTEGER NOT NULL REFERENCES caixas(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('suprimento','sangria','abertura','fechamento')),
  valor REAL NOT NULL,
  motivo TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- VENDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  caixa_id INTEGER REFERENCES caixas(id),
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  status TEXT DEFAULT 'concluida' CHECK(status IN ('concluida','cancelada','pendente')),
  subtotal REAL NOT NULL DEFAULT 0,
  desconto_valor REAL DEFAULT 0,
  desconto_percentual REAL DEFAULT 0,
  acrescimo REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro',
  valor_recebido REAL DEFAULT 0,
  troco REAL DEFAULT 0,
  tipo_cupom TEXT DEFAULT 'nao_fiscal' CHECK(tipo_cupom IN ('nao_fiscal','nfce','sat')),
  cpf_nota TEXT,
  numero_nfce TEXT,
  chave_acesso TEXT,
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em);
CREATE INDEX IF NOT EXISTS idx_vendas_caixa ON vendas(caixa_id);

CREATE TABLE IF NOT EXISTS itens_venda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  nome_produto TEXT NOT NULL,
  codigo_barras TEXT,
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unitario REAL NOT NULL,
  preco_custo REAL DEFAULT 0,
  desconto_valor REAL DEFAULT 0,
  desconto_percentual REAL DEFAULT 0,
  total REAL NOT NULL,
  ncm TEXT, cfop TEXT, cst_icms TEXT, aliquota_icms REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pagamentos_venda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  forma TEXT NOT NULL CHECK(forma IN ('dinheiro','credito','debito','pix','voucher','crediario')),
  valor REAL NOT NULL,
  parcelas INTEGER DEFAULT 1,
  nsu TEXT, bandeira TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- PEDIDOS / ORÇAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  tipo TEXT DEFAULT 'orcamento' CHECK(tipo IN ('orcamento','pedido','pre_venda')),
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  status TEXT DEFAULT 'aberto' CHECK(status IN ('aberto','aprovado','reprovado','convertido','cancelado')),
  subtotal REAL DEFAULT 0,
  desconto_valor REAL DEFAULT 0,
  desconto_percentual REAL DEFAULT 0,
  total REAL DEFAULT 0,
  data_validade TEXT,
  observacoes TEXT,
  condicoes_pagamento TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id),
  nome_produto TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unitario REAL NOT NULL,
  desconto_percentual REAL DEFAULT 0,
  total REAL NOT NULL
);

-- ============================================================
-- FINANCEIRO
-- ============================================================
CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('receber','pagar')),
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor REAL NOT NULL,
  valor_pago REAL DEFAULT 0,
  data_emissao TEXT DEFAULT (date('now','localtime')),
  data_vencimento TEXT NOT NULL,
  data_pagamento TEXT,
  status TEXT DEFAULT 'aberta' CHECK(status IN ('aberta','parcial','paga','cancelada','vencida')),
  cliente_id INTEGER REFERENCES clientes(id),
  venda_id INTEGER REFERENCES vendas(id),
  forma_pagamento TEXT,
  observacoes TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- CONFERÊNCIA DE CAIXA (sistema vs maquininha)
-- ============================================================
CREATE TABLE IF NOT EXISTS conferencias_caixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_referencia TEXT NOT NULL,
  numero_pdv INTEGER DEFAULT 1,
  usuario_id INTEGER REFERENCES usuarios(id),
  dinheiro_sistema REAL DEFAULT 0,
  credito_sistema REAL DEFAULT 0,
  debito_sistema REAL DEFAULT 0,
  pix_sistema REAL DEFAULT 0,
  dinheiro_conferido REAL,
  credito_conferido REAL,
  debito_conferido REAL,
  pix_conferido REAL,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente','conferido','divergente')),
  observacoes TEXT,
  exportado INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================================
-- MODELOS DE ETIQUETA
-- ============================================================
CREATE TABLE IF NOT EXISTS modelos_etiqueta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  largura_mm REAL DEFAULT 40,
  altura_mm REAL DEFAULT 25,
  colunas INTEGER DEFAULT 3,
  linhas INTEGER DEFAULT 10,
  margem_top REAL DEFAULT 5,
  margem_left REAL DEFAULT 5,
  espacamento_h REAL DEFAULT 3,
  espacamento_v REAL DEFAULT 3,
  mostrar_nome INTEGER DEFAULT 1,
  mostrar_preco INTEGER DEFAULT 1,
  mostrar_codigo_barras INTEGER DEFAULT 1,
  mostrar_sku INTEGER DEFAULT 0,
  mostrar_validade INTEGER DEFAULT 0,
  tamanho_fonte_nome INTEGER DEFAULT 8,
  tamanho_fonte_preco INTEGER DEFAULT 12,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO modelos_etiqueta (id, nome, largura_mm, altura_mm) VALUES (1, 'Padrão 40x25mm', 40, 25);
INSERT OR IGNORE INTO modelos_etiqueta (id, nome, largura_mm, altura_mm, colunas, linhas) VALUES (2, 'Gondola 58x40mm', 58, 40, 2, 6);
INSERT OR IGNORE INTO modelos_etiqueta (id, nome, largura_mm, altura_mm, colunas, linhas) VALUES (3, 'Joias 25x15mm', 25, 15, 4, 14);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER IF NOT EXISTS tr_atualiza_estoque_venda
AFTER INSERT ON itens_venda
FOR EACH ROW
BEGIN
  INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, venda_id)
  SELECT NEW.produto_id, 'saida', NEW.quantidade,
    estoque_atual, estoque_atual - NEW.quantidade, NEW.venda_id
  FROM produtos WHERE id = NEW.produto_id;

  UPDATE produtos
  SET estoque_atual = estoque_atual - NEW.quantidade,
      atualizado_em = datetime('now','localtime')
  WHERE id = NEW.produto_id;
END;

-- ============================================================
-- DESPESAS MENSAIS (lucro real)
-- ============================================================
CREATE TABLE IF NOT EXISTS despesas_mensais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  categoria TEXT DEFAULT 'Outros',
  valor REAL NOT NULL,
  data TEXT NOT NULL DEFAULT (date('now','localtime')),
  recorrente INTEGER DEFAULT 0,
  observacoes TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas_mensais(data);

-- ============================================================
-- MÓDULO DE TROCAS / DEVOLUÇÕES
-- ============================================================

-- Saldo de crédito do cliente na loja (carta de crédito)
CREATE TABLE IF NOT EXISTS creditos_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  valor_original REAL NOT NULL,
  valor_disponivel REAL NOT NULL,
  origem TEXT DEFAULT 'troca',   -- troca | manual
  validade TEXT,                  -- NULL = sem validade
  troca_id INTEGER,               -- referência da troca que gerou
  ativo INTEGER DEFAULT 1,
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_creditos_cliente ON creditos_cliente(cliente_id, ativo);

-- Registro de uso de crédito (quando cliente usa o saldo em nova compra)
CREATE TABLE IF NOT EXISTS uso_creditos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credito_id INTEGER NOT NULL REFERENCES creditos_cliente(id),
  venda_id INTEGER REFERENCES vendas(id),
  valor_usado REAL NOT NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- Tabela principal de trocas
CREATE TABLE IF NOT EXISTS trocas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE NOT NULL,           -- ex: TRC-20250315-0001
  venda_original_id INTEGER REFERENCES vendas(id),
  numero_venda_original TEXT,            -- para busca quando sem FK
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  caixa_id INTEGER REFERENCES caixas(id),
  motivo TEXT NOT NULL,
  status TEXT DEFAULT 'concluida' CHECK(status IN ('pendente','aprovada','concluida','cancelada')),
  aprovado_por INTEGER REFERENCES usuarios(id),
  aprovado_em TEXT,
  -- Destino do valor
  tipo_resolucao TEXT NOT NULL CHECK(tipo_resolucao IN ('carta_credito','extorno','troca_produto')),
  valor_total REAL NOT NULL DEFAULT 0,
  -- Carta de crédito
  credito_id INTEGER REFERENCES creditos_cliente(id),
  validade_credito TEXT,
  -- Extorno
  extorno_assinado INTEGER DEFAULT 0,    -- 1 = cliente assinou o documento
  -- Troca produto
  valor_diferenca REAL DEFAULT 0,        -- positivo = cliente paga, negativo = cliente recebe
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_trocas_venda ON trocas(venda_original_id);
CREATE INDEX IF NOT EXISTS idx_trocas_cliente ON trocas(cliente_id);

-- Itens devolvidos na troca
CREATE TABLE IF NOT EXISTS itens_troca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  troca_id INTEGER NOT NULL REFERENCES trocas(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  nome_produto TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unitario REAL NOT NULL,
  total REAL NOT NULL,
  condicao TEXT NOT NULL CHECK(condicao IN ('funcionando','defeito')),
  -- Funcionando → volta ao estoque; defeito → vai para aba de defeitos
  estoque_devolvido INTEGER DEFAULT 0,   -- 1 = já entrou no estoque
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- Produtos com defeito (aguardando análise/fornecedor)
CREATE TABLE IF NOT EXISTS produtos_defeito (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  nome_produto TEXT NOT NULL,
  troca_id INTEGER REFERENCES trocas(id),
  cliente_id INTEGER REFERENCES clientes(id),
  quantidade REAL NOT NULL DEFAULT 1,
  motivo TEXT NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente','analisando','devolvido_fornecedor','descartado','resolvido')),
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  resolvido_em TEXT
);

-- ============================================================
-- FORNECEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  tipo_pessoa TEXT DEFAULT 'J' CHECK(tipo_pessoa IN ('F','J')),
  cnpj TEXT, cpf TEXT,
  inscricao_estadual TEXT,
  email TEXT, telefone TEXT, celular TEXT,
  cep TEXT, logradouro TEXT, numero TEXT,
  complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  contato_nome TEXT,
  prazo_pagamento INTEGER DEFAULT 30,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores(cnpj);

-- ============================================================
-- COMPRAS (entrada de mercadoria)
-- ============================================================
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  status TEXT DEFAULT 'recebida' CHECK(status IN ('pendente','recebida','cancelada')),
  numero_nf TEXT,
  data_emissao TEXT,
  data_recebimento TEXT DEFAULT (date('now','localtime')),
  subtotal REAL DEFAULT 0,
  desconto_valor REAL DEFAULT 0,
  frete REAL DEFAULT 0,
  outras_despesas REAL DEFAULT 0,
  total REAL DEFAULT 0,
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

-- ============================================================
-- REPRESENTANTES / VENDEDORES EXTERNOS
-- ============================================================
CREATE TABLE IF NOT EXISTS representantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT,
  email TEXT,
  telefone TEXT, celular TEXT,
  cep TEXT, logradouro TEXT, numero TEXT,
  complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT,
  perc_comissao REAL DEFAULT 5.0,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- Comissões geradas por venda
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

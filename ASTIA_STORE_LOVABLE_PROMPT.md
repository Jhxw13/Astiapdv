# ASTIA STORE — Prompt para Lovable

## Visão Geral
Crie um site híbrido moderno para pequenos comércios e barbearias chamado **ASTIA Store**.
O site tem dois modos que podem ser ativados individualmente ou juntos:
- **Modo Loja**: catálogo de produtos + carrinho + pedido com retirada ou entrega
- **Modo Agendamento**: serviços + agenda visual + confirmação de horário

Todos os dados vêm do Supabase. O site é o frontend público — o backend é o sistema ASTIA PDV.

---

## Design & UX

**Estilo visual:**
- Minimalista, limpo, moderno
- Tipografia sans-serif pesada para títulos (ex: Inter, Plus Jakarta Sans)
- Muito espaço em branco
- Cards com sombra sutil, bordas arredondadas (rounded-2xl)
- Animações suaves (fade, slide) sem exagero
- 100% responsivo — mobile first (a maioria dos clientes acessa pelo celular)

**Paleta de cores:**
- Definida dinamicamente pelo campo `cor_primaria` da tabela `loja_config` no Supabase
- Fallback: preto (#0f172a) com acentos em violeta (#7c3aed)
- Fundo: branco ou cinza muito claro (#f8fafc)
- Textos: slate-900 / slate-600 / slate-400

**Componentes UI obrigatórios:**
- Header fixo com logo, nome da loja, ícone do carrinho com badge de quantidade
- Barra de busca no catálogo
- Cards de produto com foto, nome, preço, botão "Adicionar"
- Drawer/sheet lateral para o carrinho (não página separada)
- Bottom navigation no mobile (Início, Loja, Agendar, Carrinho)
- Toast notifications para feedback de ações
- Loading skeletons enquanto carrega dados
- Estado vazio com ilustração quando não há produtos/horários

---

## Estrutura de Páginas

### `/` — Home
- Banner hero com nome da loja, tagline e CTA
- Se modo loja ativo: seção "Categorias" + "Mais vendidos"
- Se modo agendamento ativo: seção "Nossos Serviços" + botão "Agendar agora"
- Se híbrido: as duas seções separadas por divider
- Rodapé com endereço, horário de funcionamento, WhatsApp

### `/loja` — Catálogo
- Filtro por categoria (chips horizontais scrolláveis)
- Busca em tempo real
- Grid de produtos (2 colunas mobile, 3-4 desktop)
- Card do produto: foto, nome, categoria, preço, botão adicionar
- Produto sem estoque: card esmaecido com "Indisponível"

### `/produto/:id` — Detalhe do Produto
- Foto grande
- Nome, descrição, categoria
- Preço em destaque
- Seletor de quantidade
- Botão "Adicionar ao carrinho"

### `/carrinho` — Resumo e Checkout
- Lista de itens com foto, nome, quantidade editável, subtotal
- Seção de entrega:
  - Opção "Retirar na loja" (endereço da loja + horário)
  - Opção "Receber em casa" → campo de bairro → mostra valor do frete calculado
- Resumo: subtotal + frete + total
- Campo nome e telefone (obrigatório, sem login)
- Campo observações (opcional)
- Botão "Confirmar Pedido"
- Pedido mínimo: se não atingido, botão bloqueado com aviso

### `/pedido/:id` — Confirmação
- Número do pedido
- Resumo dos itens
- Status atual com timeline visual:
  `Recebido → Confirmado → Em preparo → Saiu → Entregue`
  (ou `Recebido → Confirmado → Pronto para retirada → Retirado`)
- Atualiza em tempo real via Supabase Realtime
- Botão WhatsApp para falar com a loja

### `/agendar` — Escolha de Serviço e Profissional
- Cards de serviços com nome, duração, preço
- Se tiver mais de um profissional: seletor de profissional com foto
- Botão "Ver horários disponíveis"

### `/agendar/:profissional_id` — Agenda
- Calendário semanal/mensal mostrando dias disponíveis
- Ao clicar no dia: grade de horários disponíveis (ex: 09:00, 09:30, 10:00...)
- Horários ocupados aparecem bloqueados
- Ao clicar no horário: abre form com nome, telefone, serviço selecionado
- Botão "Confirmar Agendamento"

### `/agendamento/:id` — Confirmação do Agendamento
- Data, hora, serviço, profissional
- Nome do cliente
- Status: Pendente / Confirmado / Cancelado
- Atualiza em tempo real
- Botão para cancelar (até X horas antes)
- Botão WhatsApp

---

## Schema Supabase

```sql
-- Configuração da loja (1 registro por loja)
CREATE TABLE loja_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#7c3aed',
  whatsapp TEXT,
  endereco TEXT,
  cidade TEXT,
  horario_funcionamento TEXT DEFAULT 'Seg-Sex 9h-18h',
  -- Modos ativos
  modo_loja BOOLEAN DEFAULT true,
  modo_agendamento BOOLEAN DEFAULT false,
  -- Frete
  frete_tipo TEXT DEFAULT 'retirada' CHECK(frete_tipo IN ('retirada','fixo_bairro','fixo_unico')),
  frete_valor_fixo NUMERIC(10,2) DEFAULT 0,
  frete_bairros JSONB DEFAULT '[]',
  -- ex: [{"bairro":"Centro","valor":0},{"bairro":"Jardim","valor":8.00}]
  pedido_minimo NUMERIC(10,2) DEFAULT 0,
  tempo_entrega TEXT DEFAULT '40-60 min',
  -- Agendamento
  horario_inicio TEXT DEFAULT '09:00',
  horario_fim TEXT DEFAULT '18:00',
  slot_minutos INTEGER DEFAULT 30,
  dias_funcionamento JSONB DEFAULT '[1,2,3,4,5]',
  -- ex: [0=dom,1=seg,...,6=sab]
  -- Sync ASTIA
  astia_ultimo_sync TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Categorias de produtos
CREATE TABLE categorias_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astia_id INTEGER UNIQUE, -- ID da categoria no ASTIA local
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true
);

-- Produtos disponíveis na loja online
CREATE TABLE produtos_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astia_id INTEGER UNIQUE NOT NULL, -- ID do produto no ASTIA local
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL,
  foto_url TEXT,
  categoria_id UUID REFERENCES categorias_online(id),
  categoria_nome TEXT,
  estoque INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  destaque BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_produtos_online_ativo ON produtos_online(ativo);
CREATE INDEX idx_produtos_online_categoria ON produtos_online(categoria_id);

-- Profissionais (para agendamento)
CREATE TABLE profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  foto_url TEXT,
  especialidades TEXT[],
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0
);

-- Serviços (para agendamento)
CREATE TABLE servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL,
  duracao_minutos INTEGER NOT NULL DEFAULT 30,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0
);

-- Relação serviço ↔ profissional
CREATE TABLE servicos_profissionais (
  servico_id UUID REFERENCES servicos(id) ON DELETE CASCADE,
  profissional_id UUID REFERENCES profissionais(id) ON DELETE CASCADE,
  PRIMARY KEY (servico_id, profissional_id)
);

-- Clientes online (sem login, identificados por telefone)
CREATE TABLE clientes_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clientes_telefone ON clientes_online(telefone);

-- Pedidos da loja online (SEPARADO do PDV)
CREATE TABLE pedidos_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL, -- ex: WEB-20260315-0001
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
  subtotal NUMERIC(10,2) NOT NULL,
  frete NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  -- Status
  status TEXT DEFAULT 'recebido' CHECK(status IN (
    'recebido','confirmado','em_preparo','saiu','entregue',
    'pronto_retirada','retirado','cancelado'
  )),
  observacoes TEXT,
  -- Controle
  astia_sincronizado BOOLEAN DEFAULT false,
  astia_pedido_id INTEGER, -- ID do pedido no ASTIA após sync
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pedidos_online_status ON pedidos_online(status);
CREATE INDEX idx_pedidos_online_sync ON pedidos_online(astia_sincronizado);

-- Itens dos pedidos online
CREATE TABLE itens_pedido_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos_online(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos_online(id),
  astia_produto_id INTEGER, -- ID do produto no ASTIA
  nome_produto TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL
);

-- Agendamentos
CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL, -- ex: AGD-20260315-0001
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  profissional_id UUID REFERENCES profissionais(id),
  servico_id UUID REFERENCES servicos(id),
  profissional_nome TEXT,
  servico_nome TEXT,
  servico_preco NUMERIC(10,2),
  servico_duracao INTEGER,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','cancelado','concluido')),
  observacoes TEXT,
  astia_sincronizado BOOLEAN DEFAULT false,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agendamentos_data ON agendamentos(data, hora);
CREATE INDEX idx_agendamentos_profissional ON agendamentos(profissional_id, data);

-- Horários bloqueados (folgas, pausas, feriados)
CREATE TABLE horarios_bloqueados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID REFERENCES profissionais(id),
  -- NULL = bloqueia todos os profissionais
  data DATE NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  -- NULL em hora = dia inteiro bloqueado
  motivo TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Row Level Security (RLS)

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE loja_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;

-- Leitura pública (site)
CREATE POLICY "leitura_publica_config"    ON loja_config       FOR SELECT USING (true);
CREATE POLICY "leitura_publica_produtos"  ON produtos_online   FOR SELECT USING (ativo = true);
CREATE POLICY "leitura_publica_profis"    ON profissionais     FOR SELECT USING (ativo = true);
CREATE POLICY "leitura_publica_servicos"  ON servicos          FOR SELECT USING (ativo = true);
CREATE POLICY "leitura_publica_agendas"   ON agendamentos      FOR SELECT USING (true);

-- Inserção pública (cliente faz pedido/agendamento sem login)
CREATE POLICY "inserir_pedido_publico"    ON pedidos_online        FOR INSERT WITH CHECK (true);
CREATE POLICY "inserir_itens_publico"     ON itens_pedido_online   FOR INSERT WITH CHECK (true);
CREATE POLICY "inserir_agendamento"       ON agendamentos          FOR INSERT WITH CHECK (true);

-- Leitura do próprio pedido por número (sem login)
CREATE POLICY "ler_proprio_pedido"        ON pedidos_online
  FOR SELECT USING (true); -- filtrado no frontend pelo número

-- ASTIA usa service_role key para tudo (sync, atualizar status, etc.)
```

---

## Realtime (Supabase)

Habilitar Realtime nas tabelas:
- `pedidos_online` — para atualizar status na página do pedido
- `agendamentos` — para atualizar status na confirmação

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos_online;
ALTER PUBLICATION supabase_realtime ADD TABLE agendamentos;
```

---

## Funções úteis no Supabase

```sql
-- Gera número do pedido automaticamente
CREATE OR REPLACE FUNCTION gerar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
  hoje TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq  INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM pedidos_online
  WHERE criado_em::date = CURRENT_DATE;
  NEW.numero := 'WEB-' || hoje || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_numero_pedido
  BEFORE INSERT ON pedidos_online
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_pedido();

-- Gera número do agendamento automaticamente
CREATE OR REPLACE FUNCTION gerar_numero_agendamento()
RETURNS TRIGGER AS $$
DECLARE
  hoje TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq  INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
  FROM agendamentos
  WHERE criado_em::date = CURRENT_DATE;
  NEW.numero := 'AGD-' || hoje || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_numero_agendamento
  BEFORE INSERT ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_agendamento();

-- Atualiza atualizado_em automaticamente
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pedido_timestamp
  BEFORE UPDATE ON pedidos_online
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER tr_agendamento_timestamp
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
```

---

## Variáveis de Ambiente (.env)

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_aqui
```

---

## Instruções finais para o Lovable

- Use **React + TypeScript + Tailwind CSS**
- Use o cliente oficial **@supabase/supabase-js**
- Use **Supabase Realtime** para atualizações de status em tempo real
- Use **React Query** (@tanstack/react-query) para cache e sincronização de dados
- Todos os textos em **português brasileiro**
- Não criar sistema de login para clientes — identificação só por telefone
- Carrinho gerenciado em **localStorage** (persiste ao fechar o navegador)
- Modo escuro opcional (detecta preferência do sistema)
- Ícones via **lucide-react**
- Não criar painel admin — a gestão é feita pelo ASTIA PDV

## Comportamento por modo

Ler o campo `modo_loja` e `modo_agendamento` da tabela `loja_config`:

```typescript
// Se modo_loja = false: esconder tudo relacionado a produtos/carrinho
// Se modo_agendamento = false: esconder tudo relacionado a agenda/serviços
// Se ambos = true: mostrar tudo (modo híbrido)
// Navigation e rotas devem ser dinâmicas baseadas nos modos ativos
```

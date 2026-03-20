-- Criar enum para tipos de usuário
CREATE TYPE public.user_role AS ENUM ('admin', 'gerente', 'vendedor', 'caixa');

-- Criar tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  cargo public.user_role NOT NULL DEFAULT 'vendedor',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de clientes
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cpf_cnpj TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  data_nascimento DATE,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de categorias de produtos
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de produtos
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria_id UUID REFERENCES public.categorias(id),
  preco DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo DECIMAL(10,2) NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  codigo_barras TEXT,
  sku TEXT UNIQUE,
  imagem_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de vendas
CREATE TABLE public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_venda INTEGER GENERATED ALWAYS AS IDENTITY,
  cliente_id UUID REFERENCES public.clientes(id),
  vendedor_id UUID REFERENCES public.profiles(id) NOT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  desconto DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_final DECIMAL(10,2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'concluida',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de itens da venda
CREATE TABLE public.itens_venda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL,
  desconto DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de movimentações financeiras
CREATE TABLE public.movimentacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  venda_id UUID REFERENCES public.vendas(id),
  data_vencimento DATE,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado')),
  observacoes TEXT,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_financeiras ENABLE ROW LEVEL SECURITY;

-- Função para obter perfil do usuário
CREATE OR REPLACE FUNCTION public.get_user_profile(user_uuid UUID)
RETURNS public.profiles
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM public.profiles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Função para verificar se o usuário tem cargo específico
CREATE OR REPLACE FUNCTION public.has_role(user_uuid UUID, required_role public.user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = user_uuid AND cargo = required_role AND ativo = true
  );
$$;

-- Função para verificar se o usuário é admin ou gerente
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = user_uuid AND cargo IN ('admin', 'gerente') AND ativo = true
  );
$$;

-- Políticas RLS para perfis
CREATE POLICY "Usuários podem ver seus próprios perfis" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins e gerentes podem ver todos os perfis" ON public.profiles
  FOR SELECT USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Usuários podem atualizar seus próprios perfis" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins podem inserir perfis" ON public.profiles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para clientes
CREATE POLICY "Usuários autenticados podem ver clientes" ON public.clientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendedores podem inserir clientes" ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Vendedores podem atualizar clientes" ON public.clientes
  FOR UPDATE TO authenticated USING (true);

-- Políticas RLS para categorias e produtos
CREATE POLICY "Usuários autenticados podem ver categorias" ON public.categorias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerentes podem gerenciar categorias" ON public.categorias
  FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Usuários autenticados podem ver produtos" ON public.produtos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendedores podem atualizar estoque" ON public.produtos
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Gerentes podem gerenciar produtos" ON public.produtos
  FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid()));

-- Políticas RLS para vendas
CREATE POLICY "Usuários podem ver vendas" ON public.vendas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendedores podem inserir vendas" ON public.vendas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Vendedores podem ver itens de venda" ON public.itens_venda
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendedores podem inserir itens de venda" ON public.itens_venda
  FOR INSERT TO authenticated WITH CHECK (true);

-- Políticas RLS para movimentações financeiras
CREATE POLICY "Admins e gerentes podem ver movimentações" ON public.movimentacoes_financeiras
  FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins e gerentes podem gerenciar movimentações" ON public.movimentacoes_financeiras
  FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid()));

-- Função para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email, cargo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.email),
    NEW.email,
    'vendedor'
  );
  RETURN NEW;
END;
$$;

-- Trigger para criar perfil automaticamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para atualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers para atualizar timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendas_updated_at
  BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_movimentacoes_updated_at
  BEFORE UPDATE ON public.movimentacoes_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir dados iniciais
INSERT INTO public.categorias (nome, descricao) VALUES
  ('Eletrônicos', 'Produtos eletrônicos e tecnologia'),
  ('Roupas', 'Vestuário em geral'),
  ('Casa e Jardim', 'Produtos para casa e decoração'),
  ('Esportes', 'Artigos esportivos e fitness'),
  ('Livros', 'Livros e materiais de leitura');

-- Inserir produtos de exemplo
INSERT INTO public.produtos (nome, descricao, categoria_id, preco, custo, estoque, estoque_minimo, sku) 
SELECT 
  'Smartphone Galaxy S23', 
  'Smartphone Samsung Galaxy S23 128GB', 
  id, 
  2499.99, 
  1800.00, 
  15, 
  5,
  'SM-S23-128'
FROM public.categorias WHERE nome = 'Eletrônicos';

INSERT INTO public.produtos (nome, descricao, categoria_id, preco, custo, estoque, estoque_minimo, sku)
SELECT 
  'Camiseta Polo', 
  'Camiseta Polo masculina 100% algodão', 
  id, 
  89.99, 
  45.00, 
  50, 
  10,
  'POLO-M-001'
FROM public.categorias WHERE nome = 'Roupas';
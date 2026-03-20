-- Primeiro, vamos corrigir as políticas RLS para dar acesso adequado aos vendedores e caixas

-- Atualizar políticas de vendas para permitir acesso correto
DROP POLICY IF EXISTS "Admins e gerentes podem ver todas as vendas" ON public.vendas;
DROP POLICY IF EXISTS "Vendedores podem ver suas próprias vendas" ON public.vendas;
DROP POLICY IF EXISTS "Vendedores podem inserir vendas" ON public.vendas;

-- Políticas para vendas
CREATE POLICY "Usuários podem ver vendas relacionadas" 
ON public.vendas 
FOR SELECT 
USING (
  -- Admins e gerentes veem tudo
  is_admin_or_manager(auth.uid()) OR 
  -- Vendedores veem suas próprias vendas
  vendedor_id = auth.uid()
);

CREATE POLICY "Vendedores e caixas podem inserir vendas" 
ON public.vendas 
FOR INSERT 
WITH CHECK (
  -- Vendedores e caixas podem inserir
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo IN ('vendedor', 'caixa') 
    AND ativo = true
  )
);

-- Atualizar políticas de itens_venda
DROP POLICY IF EXISTS "Vendedores podem ver itens de venda" ON public.itens_venda;
DROP POLICY IF EXISTS "Vendedores podem inserir itens de venda" ON public.itens_venda;

CREATE POLICY "Usuários podem ver itens de vendas relacionadas" 
ON public.itens_venda 
FOR SELECT 
USING (
  -- Admins e gerentes veem tudo
  is_admin_or_manager(auth.uid()) OR 
  -- Vendedores veem itens de suas próprias vendas
  EXISTS (
    SELECT 1 FROM public.vendas v 
    WHERE v.id = venda_id 
    AND v.vendedor_id = auth.uid()
  )
);

CREATE POLICY "Vendedores e caixas podem inserir itens de venda" 
ON public.itens_venda 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo IN ('vendedor', 'caixa') 
    AND ativo = true
  )
);

-- Criar tabela de pedidos
CREATE TABLE IF NOT EXISTS public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido INTEGER NOT NULL UNIQUE,
  vendedor_id UUID NOT NULL,
  cliente_id UUID,
  total NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  total_final NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  data_venda DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS na tabela pedidos
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- Políticas para pedidos
CREATE POLICY "Usuários podem ver pedidos relacionados" 
ON public.pedidos 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) OR 
  vendedor_id = auth.uid()
);

CREATE POLICY "Vendedores podem inserir pedidos" 
ON public.pedidos 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo = 'vendedor' 
    AND ativo = true
  )
);

CREATE POLICY "Vendedores podem atualizar seus pedidos" 
ON public.pedidos 
FOR UPDATE 
USING (vendedor_id = auth.uid());

-- Criar tabela de itens de pedido
CREATE TABLE IF NOT EXISTS public.itens_pedido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL,
  produto_id UUID NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC NOT NULL,
  desconto NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS na tabela itens_pedido
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;

-- Políticas para itens_pedido
CREATE POLICY "Usuários podem ver itens de pedidos relacionados" 
ON public.itens_pedido 
FOR SELECT 
USING (
  is_admin_or_manager(auth.uid()) OR 
  EXISTS (
    SELECT 1 FROM public.pedidos p 
    WHERE p.id = pedido_id 
    AND p.vendedor_id = auth.uid()
  )
);

CREATE POLICY "Vendedores podem inserir itens de pedido" 
ON public.itens_pedido 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pedidos p 
    JOIN public.profiles pr ON pr.user_id = auth.uid()
    WHERE p.id = pedido_id 
    AND p.vendedor_id = auth.uid()
    AND pr.cargo = 'vendedor' 
    AND pr.ativo = true
  )
);

-- Adicionar trigger para atualizar updated_at nos pedidos
CREATE TRIGGER update_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Sequência para números de pedidos
CREATE SEQUENCE IF NOT EXISTS public.pedidos_numero_seq START 1000;

-- Função para gerar número de pedido
CREATE OR REPLACE FUNCTION public.generate_pedido_number()
RETURNS INTEGER AS $$
BEGIN
  RETURN nextval('public.pedidos_numero_seq');
END;
$$ LANGUAGE plpgsql;

-- Sequência para números de vendas (caso não exista)
CREATE SEQUENCE IF NOT EXISTS public.vendas_numero_seq START 1000;

-- Função para gerar número de venda
CREATE OR REPLACE FUNCTION public.generate_venda_number()
RETURNS INTEGER AS $$
BEGIN
  RETURN nextval('public.vendas_numero_seq');
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-gerar número de pedido
CREATE OR REPLACE FUNCTION public.set_pedido_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_pedido IS NULL THEN
    NEW.numero_pedido := public.generate_pedido_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_pedido_number_trigger
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pedido_number();

-- Trigger para auto-gerar número de venda
CREATE OR REPLACE FUNCTION public.set_venda_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_venda IS NULL THEN
    NEW.numero_venda := public.generate_venda_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_venda_number_trigger
  BEFORE INSERT ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_venda_number();

-- Atualizar políticas de movimentações financeiras para incluir vendedores/caixas
DROP POLICY IF EXISTS "Admins e gerentes podem gerenciar movimentações" ON public.movimentacoes_financeiras;
DROP POLICY IF EXISTS "Admins e gerentes podem ver movimentações" ON public.movimentacoes_financeiras;

CREATE POLICY "Admins e gerentes podem ver movimentações" 
ON public.movimentacoes_financeiras 
FOR SELECT 
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins e gerentes podem inserir movimentações" 
ON public.movimentacoes_financeiras 
FOR INSERT 
WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins e gerentes podem atualizar movimentações" 
ON public.movimentacoes_financeiras 
FOR UPDATE 
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins e gerentes podem deletar movimentações" 
ON public.movimentacoes_financeiras 
FOR DELETE 
USING (is_admin_or_manager(auth.uid()));

-- Sistema pode inserir movimentações automáticas das vendas
CREATE POLICY "Sistema pode inserir movimentações de vendas" 
ON public.movimentacoes_financeiras 
FOR INSERT 
WITH CHECK (
  venda_id IS NOT NULL AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo IN ('vendedor', 'caixa') 
    AND ativo = true
  )
);
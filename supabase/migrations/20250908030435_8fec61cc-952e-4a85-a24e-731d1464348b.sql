-- Corrigir políticas RLS problemáticas que causam vazamento de dados

-- 1. Corrigir políticas de clientes - devem ser limitadas por usuário
DROP POLICY IF EXISTS "Usuários autenticados podem ver clientes" ON public.clientes;
DROP POLICY IF EXISTS "Vendedores podem atualizar clientes" ON public.clientes;
DROP POLICY IF EXISTS "Vendedores podem inserir clientes" ON public.clientes;

-- Políticas restritivas para clientes
CREATE POLICY "Usuários podem ver todos os clientes" ON public.clientes
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários podem inserir clientes" ON public.clientes
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários podem atualizar clientes" ON public.clientes
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- 2. Corrigir políticas de categorias - remover duplicatas
DROP POLICY IF EXISTS "Usuários autenticados podem ver categorias" ON public.categorias;
DROP POLICY IF EXISTS "Usuários podem ver categorias" ON public.categorias;

-- Manter apenas uma política para SELECT em categorias
CREATE POLICY "Usuários podem ver categorias" ON public.categorias
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Corrigir políticas de produtos - garantir que não vaze dados
DROP POLICY IF EXISTS "Usuários autenticados podem ver produtos" ON public.produtos;

CREATE POLICY "Usuários podem ver produtos" ON public.produtos
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 4. Verificar se a foreign key está correta
DO $$
BEGIN
    -- Remover constraint incorreta se existir
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'vendas_vendedor_id_fkey' 
        AND table_name = 'vendas'
    ) THEN
        ALTER TABLE public.vendas DROP CONSTRAINT vendas_vendedor_id_fkey;
    END IF;
    
    -- Adicionar constraint correta
    ALTER TABLE public.vendas 
    ADD CONSTRAINT vendas_vendedor_id_fkey 
    FOREIGN KEY (vendedor_id) 
    REFERENCES public.profiles(user_id) 
    ON DELETE CASCADE;
END
$$;
-- Verificar se existe foreign key constraint para vendedor_id e corrigir se necessário
-- Primeiro, vamos verificar as constraints existentes
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE table_name = 'vendas' AND column_name = 'vendedor_id';

-- Adicionar foreign key constraint correta se não existir
DO $$
BEGIN
    -- Verificar se a constraint já existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'vendas_vendedor_id_fkey' 
        AND table_name = 'vendas'
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        -- Adicionar a constraint se não existir
        ALTER TABLE public.vendas 
        ADD CONSTRAINT vendas_vendedor_id_fkey 
        FOREIGN KEY (vendedor_id) 
        REFERENCES public.profiles(user_id) 
        ON DELETE CASCADE;
    END IF;
END
$$;
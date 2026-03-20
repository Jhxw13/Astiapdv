-- Check if all necessary tables exist and create missing ones

-- Create categorias table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on categorias
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- Create policies for categorias
DROP POLICY IF EXISTS "Usuários podem ver categorias" ON public.categorias;
CREATE POLICY "Usuários podem ver categorias" 
ON public.categorias 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários podem criar categorias" ON public.categorias;
CREATE POLICY "Usuários podem criar categorias" 
ON public.categorias 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários podem atualizar categorias" ON public.categorias;
CREATE POLICY "Usuários podem atualizar categorias" 
ON public.categorias 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Add categoria_id to produtos table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produtos' AND column_name = 'categoria_id') THEN
    ALTER TABLE public.produtos ADD COLUMN categoria_id UUID REFERENCES public.categorias(id);
  END IF;
END $$;

-- Ensure numero_venda exists in vendas table and has proper sequence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendas' AND column_name = 'numero_venda') THEN
    -- Create sequence for numero_venda
    CREATE SEQUENCE IF NOT EXISTS vendas_numero_seq START 1;
    
    -- Add numero_venda column
    ALTER TABLE public.vendas ADD COLUMN numero_venda INTEGER DEFAULT nextval('vendas_numero_seq');
    
    -- Update existing rows
    UPDATE public.vendas SET numero_venda = nextval('vendas_numero_seq') WHERE numero_venda IS NULL;
    
    -- Make it NOT NULL
    ALTER TABLE public.vendas ALTER COLUMN numero_venda SET NOT NULL;
  END IF;
END $$;
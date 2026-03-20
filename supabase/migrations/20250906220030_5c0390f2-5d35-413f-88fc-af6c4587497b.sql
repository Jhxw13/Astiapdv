-- Fix the vendas table - add missing columns and fix RLS policies
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro';

-- Fix RLS policy conflicts for vendas
DROP POLICY IF EXISTS "Usuários podem ver vendas" ON public.vendas;

-- Keep only the restricted policy for vendas access
-- This ensures proper security while allowing sales creation

-- Fix produtos insert policy - currently only admins/managers can create products
-- Let's add a policy for all authenticated users to create products (can be restricted later)
DROP POLICY IF EXISTS "Vendedores podem inserir produtos" ON public.produtos;
CREATE POLICY "Vendedores podem inserir produtos" 
ON public.produtos 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure form_pagamento field exists and has proper default
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendas' AND column_name = 'forma_pagamento') THEN
    ALTER TABLE public.vendas ADD COLUMN forma_pagamento TEXT NOT NULL DEFAULT 'dinheiro';
  END IF;
END $$;
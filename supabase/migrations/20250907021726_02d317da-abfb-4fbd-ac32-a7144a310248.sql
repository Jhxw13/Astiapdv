-- Verificar e criar sequência para número de venda se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'vendas_numero_seq') THEN
        CREATE SEQUENCE public.vendas_numero_seq START 1;
    END IF;
END
$$;

-- Verificar e criar trigger para número de venda se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'set_venda_number_trigger' AND event_object_table = 'vendas') THEN
        CREATE TRIGGER set_venda_number_trigger
        BEFORE INSERT ON public.vendas
        FOR EACH ROW
        EXECUTE FUNCTION public.set_venda_number();
    END IF;
END
$$;

-- Verificar e criar trigger handle_new_user se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created' AND event_object_table = 'users') THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW 
        EXECUTE FUNCTION public.handle_new_user();
    END IF;
END
$$;

-- Verificar policies para vendas - permitir vendedores e caixas
DROP POLICY IF EXISTS "Vendedores e caixas podem inserir vendas" ON public.vendas;
CREATE POLICY "Vendedores e caixas podem inserir vendas"
ON public.vendas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo IN ('vendedor', 'caixa', 'admin', 'gerente') 
    AND ativo = true
  )
);

-- Verificar policies para movimentações financeiras - permitir inserção relacionada a vendas
DROP POLICY IF EXISTS "Sistema pode inserir movimentações de vendas" ON public.movimentacoes_financeiras;
CREATE POLICY "Sistema pode inserir movimentações de vendas"
ON public.movimentacoes_financeiras
FOR INSERT
WITH CHECK (
  venda_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND cargo IN ('vendedor', 'caixa', 'admin', 'gerente') 
    AND ativo = true
  )
);

-- Verificar se a função handle_new_user existe
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email, cargo, ativo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.email),
    NEW.email,
    'vendedor',
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
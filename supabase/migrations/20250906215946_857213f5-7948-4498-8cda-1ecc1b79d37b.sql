-- Check if triggers exist and create missing ones

-- Check if triggers exist for vendas
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'vendas';

-- Check if trigger exists for numero_venda
DO $$
BEGIN
  -- Create trigger for numero_venda if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'set_venda_number_trigger' 
    AND event_object_table = 'vendas'
  ) THEN
    CREATE TRIGGER set_venda_number_trigger
      BEFORE INSERT ON public.vendas
      FOR EACH ROW
      EXECUTE FUNCTION public.set_venda_number();
  END IF;
END $$;

-- Check if trigger exists for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'update_vendas_updated_at' 
    AND event_object_table = 'vendas'
  ) THEN
    CREATE TRIGGER update_vendas_updated_at
      BEFORE UPDATE ON public.vendas
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Ensure produtos have update trigger too
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'update_produtos_updated_at' 
    AND event_object_table = 'produtos'
  ) THEN
    CREATE TRIGGER update_produtos_updated_at
      BEFORE UPDATE ON public.produtos
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Check the sequence exists
CREATE SEQUENCE IF NOT EXISTS public.vendas_numero_seq START 1;
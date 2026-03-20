-- Corrigir search_path nas funções
CREATE OR REPLACE FUNCTION public.generate_pedido_number()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN nextval('public.pedidos_numero_seq');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_venda_number()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN nextval('public.vendas_numero_seq');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pedido_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_pedido IS NULL THEN
    NEW.numero_pedido := public.generate_pedido_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_venda_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_venda IS NULL THEN
    NEW.numero_venda := public.generate_venda_number();
  END IF;
  RETURN NEW;
END;
$$;
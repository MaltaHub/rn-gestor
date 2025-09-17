-- Sistema de gerenciamento de configurações para características, modelos, locais e lojas

-- Criar enum para as categorias de configuração
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'configuration_category'
  ) THEN
    CREATE TYPE public.configuration_category AS ENUM (
      'features',
      'models',
      'locations',
      'stores'
    );
  END IF;
END
$$;

-- Criar tabela de itens de configuração
CREATE TABLE IF NOT EXISTS public.configuration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.configuration_category NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  description text,
  store public.store_type,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT configuration_items_unique UNIQUE (category, value, store)
);

-- Índices para melhorar consultas
CREATE INDEX IF NOT EXISTS idx_configuration_items_category
  ON public.configuration_items (category);

CREATE INDEX IF NOT EXISTS idx_configuration_items_category_active
  ON public.configuration_items (category, is_active);

-- Trigger para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION public.configuration_items_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_configuration_items_set_updated_at ON public.configuration_items;
CREATE TRIGGER trg_configuration_items_set_updated_at
  BEFORE UPDATE ON public.configuration_items
  FOR EACH ROW
  EXECUTE FUNCTION public.configuration_items_set_updated_at();

-- Habilitar RLS
ALTER TABLE public.configuration_items ENABLE ROW LEVEL SECURITY;

-- Política para leitura por qualquer usuário autenticado
CREATE POLICY "Authenticated users can read configuration items"
  ON public.configuration_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Política para gerenciamento restrita a administradores
CREATE POLICY "Only administrators can manage configuration items"
  ON public.configuration_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND role = 'Administrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND role = 'Administrador'
    )
  );

-- Dados iniciais para cada categoria
INSERT INTO public.configuration_items (category, name, value, description, sort_order)
VALUES
  ('features', 'Ar-condicionado', 'ar_condicionado', 'Equipamento de conforto', 1),
  ('features', 'Direção hidráulica', 'direcao_hidraulica', 'Assistência de direção', 2),
  ('features', 'Câmbio automático', 'cambio_automatico', 'Transmissão automática', 3),
  ('models', 'Chevrolet Onix', 'chevrolet_onix', 'Compacto mais vendido', 1),
  ('models', 'Hyundai HB20', 'hyundai_hb20', 'Hatch compacto', 2),
  ('models', 'Toyota Corolla', 'toyota_corolla', 'Sedan médio', 3),
  ('locations', 'Oficina', 'oficina', 'Veículo encontra-se na oficina', 1),
  ('locations', 'Funilaria', 'funilaria', 'Veículo em reparo de funilaria', 2),
  ('locations', 'Estacionamento principal', 'estacionamento_principal', 'Disponível para venda imediata', 3),
  ('stores', 'Roberto Automóveis', 'roberto_automoveis', 'Loja matriz', 1),
  ('stores', 'RN Multimarcas', 'rn_multimarcas', 'Loja filial', 2)
ON CONFLICT ON CONSTRAINT configuration_items_unique DO NOTHING;

-- Garantir que as lojas existam também como valores ativos
UPDATE public.configuration_items
SET is_active = true
WHERE category = 'stores';

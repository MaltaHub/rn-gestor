
-- Adicionar campos de publicação na tabela advertisements
ALTER TABLE public.advertisements 
ADD COLUMN publicado boolean DEFAULT false,
ADD COLUMN data_publicacao timestamp with time zone,
ADD COLUMN publicado_por uuid REFERENCES auth.users(id);

-- Função para auto-gerar tarefa quando anúncio é criado
CREATE OR REPLACE FUNCTION public.auto_generate_publication_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Gerar tarefa para publicar anúncio quando um novo anúncio é criado
  INSERT INTO public.tasks (
    title,
    description,
    tipo_tarefa,
    prioridade,
    cargo_alvo,
    related_field,
    field_value,
    store
  ) VALUES (
    'Publicar anúncio na ' || NEW.platform,
    'Anúncio criado para as placas: ' || array_to_string(NEW.vehicle_plates, ', ') || '. Publicar na plataforma ' || NEW.platform,
    'geral',
    'normal',
    'Consultor',
    'advertisement_id',
    NEW.id::text,
    NEW.store
  );
  
  RETURN NEW;
END;
$$;

-- Trigger para auto-gerar tarefa de publicação
CREATE TRIGGER trigger_auto_generate_publication_task
  AFTER INSERT ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_publication_task();

-- Função para resolver insights quando anúncio é marcado como publicado
CREATE OR REPLACE FUNCTION public.resolve_advertisement_insights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se o anúncio foi marcado como publicado, resolver insights relacionados
  IF NEW.publicado = true AND (OLD.publicado IS NULL OR OLD.publicado = false) THEN
    -- Resolver insights de "faltando_anuncio" para os veículos deste anúncio
    UPDATE public.advertisement_insights 
    SET resolved = true, resolved_at = now()
    WHERE insight_type = 'faltando_anuncio'
      AND platform = NEW.platform
      AND store = NEW.store
      AND vehicle_id = NEW.id_origem
      AND resolved = false;
      
    -- Completar tarefas relacionadas à publicação deste anúncio
    UPDATE public.tasks
    SET completed = true
    WHERE related_field = 'advertisement_id'
      AND field_value = NEW.id::text
      AND completed = false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para resolver insights quando anúncio é publicado
CREATE TRIGGER trigger_resolve_advertisement_insights
  AFTER UPDATE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_advertisement_insights();

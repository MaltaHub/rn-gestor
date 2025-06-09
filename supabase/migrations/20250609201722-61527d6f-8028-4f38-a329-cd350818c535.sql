
-- FASE 1: Desabilitar o trigger problemático temporariamente
DROP TRIGGER IF EXISTS trg_task_on_ad_update ON public.advertisements;

-- Corrigir a função para não usar JWT claims
CREATE OR REPLACE FUNCTION public.trg_task_on_ad_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só criar tarefa se houver mudanças significativas e não for apenas marcar como publicado
  IF (OLD.publicado IS DISTINCT FROM NEW.publicado AND NEW.publicado = true) THEN
    -- Não criar tarefa quando apenas marcando como publicado
    RETURN NEW;
  END IF;
  
  -- Para outras mudanças, criar tarefa sem depender do JWT
  IF (OLD.id_ancora IS DISTINCT FROM NEW.id_ancora OR 
      OLD.advertised_price IS DISTINCT FROM NEW.advertised_price OR
      OLD.description IS DISTINCT FROM NEW.description OR
      OLD.vehicle_plates IS DISTINCT FROM NEW.vehicle_plates) THEN
    
    INSERT INTO public.tasks (
      title, 
      description, 
      related_field, 
      field_value, 
      tipo_tarefa,
      prioridade,
      store
    ) VALUES (
      'Atualizar anúncio na plataforma ' || NEW.platform,
      'O anúncio ID: ' || NEW.id_ancora || ' foi modificado e precisa ser revisado.',
      'advertisement_id',
      NEW.id::text,
      'geral',
      'normal',
      NEW.store
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recriar o trigger corrigido
CREATE TRIGGER trg_task_on_ad_update
  AFTER UPDATE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_task_on_ad_update();

-- Verificar se existe algum outro trigger ou função problemática
-- Corrigir a função de geração automática de tarefas também
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

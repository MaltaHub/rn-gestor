
-- Primeiro, vamos criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_id ON public.tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source_pendency_id ON public.tasks(source_pendency_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_created ON public.tasks(auto_created);

-- Função para sincronizar tarefas com estado atual (lógica de espelhamento)
CREATE OR REPLACE FUNCTION public.sync_tasks_with_current_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remover tarefas órfãs (anúncios que não existem mais ou foram publicados)
  DELETE FROM public.tasks 
  WHERE auto_created = true 
  AND status = 'pending'
  AND source_pendency_id IS NOT NULL
  AND (
    -- Anúncio não existe mais
    NOT EXISTS (
      SELECT 1 FROM public.advertisements 
      WHERE id::text = source_pendency_id
    )
    OR
    -- Anúncio existe mas já foi publicado
    EXISTS (
      SELECT 1 FROM public.advertisements 
      WHERE id::text = source_pendency_id 
      AND publicado = true
    )
  );

  -- Remover tarefas de veículos que não existem mais ou foram vendidos
  DELETE FROM public.tasks
  WHERE auto_created = true
  AND status = 'pending'
  AND vehicle_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicles 
    WHERE id = tasks.vehicle_id 
    AND status = 'available'
  );

  -- Criar tarefas apenas para anúncios não publicados que não têm tarefa
  INSERT INTO public.tasks (
    title, description, category, prioridade, 
    store, source_pendency_id, auto_created, status
  )
  SELECT 
    'Publicar anúncio na ' || a.platform,
    'Anúncio para as placas: ' || array_to_string(a.vehicle_plates, ', ') || '. Revisar e publicar na ' || a.platform,
    'advertisements'::task_category,
    'normal'::prioridade_tipo,
    a.store,
    a.id::text,
    true,
    'pending'::task_status
  FROM public.advertisements a
  WHERE a.publicado = false
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.source_pendency_id = a.id::text
    AND t.status = 'pending'
    AND t.auto_created = true
  );
END;
$$;

-- Função atualizada para criar tarefa sem duplicatas
CREATE OR REPLACE FUNCTION public.create_automatic_task(
  p_title text,
  p_description text,
  p_vehicle_id uuid DEFAULT NULL,
  p_category task_category DEFAULT 'system',
  p_priority prioridade_tipo DEFAULT 'normal',
  p_store store_type DEFAULT NULL,
  p_source_pendency_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_id uuid;
BEGIN
  -- Verificar se já existe tarefa pendente similar
  IF EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE title = p_title 
    AND COALESCE(vehicle_id::text, '') = COALESCE(p_vehicle_id::text, '')
    AND COALESCE(source_pendency_id, '') = COALESCE(p_source_pendency_id, '')
    AND status = 'pending'
    AND auto_created = true
  ) THEN
    RETURN NULL; -- Não criar duplicata
  END IF;

  -- Criar nova tarefa
  INSERT INTO public.tasks (
    title, description, vehicle_id, category, prioridade, 
    store, source_pendency_id, auto_created, status
  ) VALUES (
    p_title, p_description, p_vehicle_id, p_category, 
    p_priority, p_store, p_source_pendency_id, true, 'pending'
  ) RETURNING id INTO task_id;

  RETURN task_id;
END;
$$;

-- Trigger para CASCADE DELETE quando anúncio é removido
CREATE OR REPLACE FUNCTION public.cleanup_tasks_on_ad_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remover apenas tarefas pending relacionadas ao anúncio deletado
  DELETE FROM public.tasks 
  WHERE source_pendency_id = OLD.id::text 
  AND status = 'pending'
  AND auto_created = true;
  
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_tasks_on_ad_delete ON public.advertisements;
CREATE TRIGGER trg_cleanup_tasks_on_ad_delete
  AFTER DELETE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_tasks_on_ad_delete();

-- Trigger para completar tarefas quando anúncio é publicado
CREATE OR REPLACE FUNCTION public.complete_tasks_on_ad_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se anúncio foi marcado como publicado, completar tarefas relacionadas
  IF NEW.publicado = true AND (OLD.publicado IS NULL OR OLD.publicado = false) THEN
    UPDATE public.tasks 
    SET 
      status = 'completed',
      completed_at = now()
    WHERE source_pendency_id = NEW.id::text 
    AND status = 'pending'
    AND auto_created = true;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_tasks_on_ad_publish ON public.advertisements;
CREATE TRIGGER trg_complete_tasks_on_ad_publish
  AFTER UPDATE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_tasks_on_ad_publish();

-- Função para obter estado consolidado das tarefas
CREATE OR REPLACE FUNCTION public.get_consolidated_task_state()
RETURNS TABLE(
  task_id uuid,
  title text,
  description text,
  vehicle_id uuid,
  category task_category,
  priority prioridade_tipo,
  store store_type,
  status task_status,
  created_at timestamp with time zone,
  completed_at timestamp with time zone,
  source_type text,
  source_id text,
  vehicle_plate text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Primeiro sincronizar estado
  PERFORM public.sync_tasks_with_current_state();
  
  -- Retornar estado consolidado
  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.description,
    t.vehicle_id,
    t.category,
    t.prioridade,
    t.store,
    t.status,
    t.created_at,
    t.completed_at,
    CASE 
      WHEN t.source_pendency_id IS NOT NULL THEN 'advertisement'
      WHEN t.vehicle_id IS NOT NULL THEN 'vehicle'
      ELSE 'system'
    END as source_type,
    t.source_pendency_id,
    v.plate
  FROM public.tasks t
  LEFT JOIN public.vehicles v ON t.vehicle_id = v.id
  WHERE t.auto_created = true
  ORDER BY 
    CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
    t.created_at DESC;
END;
$$;

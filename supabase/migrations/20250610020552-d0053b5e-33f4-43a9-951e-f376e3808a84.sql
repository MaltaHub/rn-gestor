
-- FASE 1: Limpeza de Conflitos e Padronização (CORRIGIDA)

-- 1. Primeiro, remover TODOS os triggers que dependem das funções
DROP TRIGGER IF EXISTS trigger_auto_generate_publication_task ON public.advertisements;
DROP TRIGGER IF EXISTS trg_task_on_ad_update ON public.advertisements;
DROP TRIGGER IF EXISTS trg_task_after_ad_update ON public.advertisements;
DROP TRIGGER IF EXISTS trg_update_task_metrics ON public.tasks;
DROP TRIGGER IF EXISTS trg_complete_tasks_on_ad_publish ON public.advertisements;
DROP TRIGGER IF EXISTS trg_cleanup_tasks_on_ad_delete ON public.advertisements;

-- 2. Agora remover as funções obsoletas
DROP FUNCTION IF EXISTS public.auto_generate_publication_task() CASCADE;
DROP FUNCTION IF EXISTS public.trg_task_on_ad_update() CASCADE;
DROP FUNCTION IF EXISTS public.update_task_metrics() CASCADE;

-- 3. Padronizar esquema da tabela tasks (remover campos obsoletos)
ALTER TABLE public.tasks 
DROP COLUMN IF EXISTS completed,
DROP COLUMN IF EXISTS cargo_alvo,
DROP COLUMN IF EXISTS aprovacao_requerida,
DROP COLUMN IF EXISTS data_vencimento,
DROP COLUMN IF EXISTS tipo_tarefa,
DROP COLUMN IF EXISTS created_by,
DROP COLUMN IF EXISTS related_field,
DROP COLUMN IF EXISTS field_value;

-- 4. Garantir que campos essenciais existem
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS description text DEFAULT '',
ADD COLUMN IF NOT EXISTS status task_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS category task_category DEFAULT 'system',
ADD COLUMN IF NOT EXISTS auto_created boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS source_pendency_id text,
ADD COLUMN IF NOT EXISTS prioridade prioridade_tipo DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS store store_type,
ADD COLUMN IF NOT EXISTS vehicle_id uuid,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS estimated_duration interval,
ADD COLUMN IF NOT EXISTS actual_duration interval;

-- 5. Criar índices otimizados
CREATE INDEX IF NOT EXISTS idx_tasks_auto_created_status ON public.tasks(auto_created, status);
CREATE INDEX IF NOT EXISTS idx_tasks_source_pendency ON public.tasks(source_pendency_id) WHERE source_pendency_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_status ON public.tasks(vehicle_id, status) WHERE vehicle_id IS NOT NULL;

-- FASE 2: Implementar Lógica Unificada

-- Função unificada de sincronização (sem execução automática)
CREATE OR REPLACE FUNCTION public.sync_tasks_with_current_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remover tarefas órfãs de anúncios que não existem mais ou foram publicados
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

  -- Criar tarefas APENAS para anúncios não publicados que não têm tarefa
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

-- Função para criar tarefas sem duplicatas
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
  -- Verificação rigorosa de duplicatas por source_pendency_id
  IF p_source_pendency_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE source_pendency_id = p_source_pendency_id
    AND status = 'pending'
    AND auto_created = true
  ) THEN
    RETURN NULL; -- Não criar duplicata
  END IF;

  -- Verificação de duplicatas por título e veículo
  IF p_vehicle_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE title = p_title 
    AND vehicle_id = p_vehicle_id
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

-- FASE 3: Triggers Coordenados

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

-- Trigger para remover tarefas quando anúncio é deletado
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

-- Recriar triggers coordenados
CREATE TRIGGER trg_complete_tasks_on_ad_publish
  AFTER UPDATE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_tasks_on_ad_publish();

CREATE TRIGGER trg_cleanup_tasks_on_ad_delete
  AFTER DELETE ON public.advertisements
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_tasks_on_ad_delete();

-- FASE 4: Função de Estado Consolidado (SEM sync automático)
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
  -- RETORNAR APENAS o estado atual (SEM sync automático)
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

-- FASE 5: Função de Resolução de Pendências Corrigida
CREATE OR REPLACE FUNCTION public.resolve_pendency(
  p_pendency_type text,
  p_pendency_identifier text,
  p_resolution_method text DEFAULT 'manual',
  p_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Registrar resolução
  INSERT INTO public.pendency_resolutions (
    pendency_type, pendency_identifier, resolved_by, 
    resolution_method, notes
  ) VALUES (
    p_pendency_type, p_pendency_identifier, auth.uid(),
    p_resolution_method, p_notes
  );

  -- Atualizar métricas do usuário
  INSERT INTO public.productivity_metrics (user_id, pendencies_resolved)
  VALUES (auth.uid(), 1)
  ON CONFLICT (user_id, date) 
  DO UPDATE SET 
    pendencies_resolved = productivity_metrics.pendencies_resolved + 1,
    updated_at = now();

  -- Marcar tarefas relacionadas como completadas (usando source_pendency_id)
  UPDATE public.tasks 
  SET status = 'completed', completed_at = now()
  WHERE source_pendency_id = p_pendency_identifier 
  AND status = 'pending'
  AND auto_created = true;

  RETURN true;
END;
$$;

-- Executar sincronização inicial para limpar estado atual
SELECT public.sync_tasks_with_current_state();

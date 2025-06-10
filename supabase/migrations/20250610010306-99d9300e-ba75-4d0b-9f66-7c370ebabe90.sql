
-- Criar enum para status de tarefas
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Criar enum para tipos de tarefa mais específicos
CREATE TYPE task_category AS ENUM ('photos', 'advertisements', 'documentation', 'maintenance', 'system');

-- Atualizar tabela de tarefas para ser mais robusta
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS status task_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS category task_category DEFAULT 'system',
ADD COLUMN IF NOT EXISTS auto_created boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS source_pendency_id text,
ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS estimated_duration interval,
ADD COLUMN IF NOT EXISTS actual_duration interval;

-- Criar tabela para tracking de resolução de pendências
CREATE TABLE IF NOT EXISTS public.pendency_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pendency_type text NOT NULL,
  pendency_identifier text NOT NULL,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamp with time zone DEFAULT now(),
  resolution_method text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Criar tabela para métricas de produtividade
CREATE TABLE IF NOT EXISTS public.productivity_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  date date DEFAULT CURRENT_DATE,
  tasks_completed integer DEFAULT 0,
  pendencies_resolved integer DEFAULT 0,
  total_time_spent interval DEFAULT '0 minutes',
  efficiency_score numeric(3,2),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.pendency_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para pendency_resolutions
CREATE POLICY "Users can view all pendency resolutions" ON public.pendency_resolutions
  FOR SELECT USING (true);

CREATE POLICY "Users can create pendency resolutions" ON public.pendency_resolutions
  FOR INSERT WITH CHECK (resolved_by = auth.uid());

-- Políticas RLS para productivity_metrics
CREATE POLICY "Users can view their own metrics" ON public.productivity_metrics
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own metrics" ON public.productivity_metrics
  FOR ALL USING (user_id = auth.uid());

-- Função para criar tarefas automáticas baseadas em pendências
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
  -- Verificar se já existe tarefa similar
  IF EXISTS (
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

-- Função para resolver pendência e registrar métricas
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

  -- Marcar tarefas relacionadas como completadas
  UPDATE public.tasks 
  SET status = 'completed', completed_at = now()
  WHERE source_pendency_id = p_pendency_identifier 
  AND status = 'pending';

  RETURN true;
END;
$$;

-- Trigger para atualizar métricas quando tarefa é completada
CREATE OR REPLACE FUNCTION public.update_task_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Calcular duração real
    NEW.actual_duration = NEW.completed_at - COALESCE(NEW.assigned_at, NEW.created_at);
    
    -- Atualizar métricas do usuário
    INSERT INTO public.productivity_metrics (user_id, tasks_completed)
    VALUES (COALESCE(NEW.atribuido_para, auth.uid()), 1)
    ON CONFLICT (user_id, date) 
    DO UPDATE SET 
      tasks_completed = productivity_metrics.tasks_completed + 1,
      total_time_spent = productivity_metrics.total_time_spent + NEW.actual_duration,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_task_metrics
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_metrics();

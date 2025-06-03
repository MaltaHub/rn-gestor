
-- Políticas RLS para notificações globais

-- Habilitar RLS na tabela notifications (caso não esteja habilitado)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Política para permitir que todos os usuários autenticados vejam todas as notificações
CREATE POLICY "Authenticated users can view all notifications" 
  ON public.notifications 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Política para permitir inserção de notificações (sistema interno)
CREATE POLICY "System can insert notifications" 
  ON public.notifications 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Habilitar RLS na tabela notification_read_status
ALTER TABLE public.notification_read_status ENABLE ROW LEVEL SECURITY;

-- Política para que usuários vejam apenas seus próprios status de leitura
CREATE POLICY "Users can view their own notification status" 
  ON public.notification_read_status 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

-- Política para que usuários possam inserir/atualizar seus próprios status
CREATE POLICY "Users can manage their own notification status" 
  ON public.notification_read_status 
  FOR ALL 
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

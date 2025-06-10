
-- Primeira migração: Criar políticas RLS e corrigir enum
-- 1. Criar políticas RLS para a tabela role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Política para permitir SELECT para todos os usuários autenticados
CREATE POLICY "Authenticated users can view role permissions" 
  ON public.role_permissions 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Política para permitir INSERT/UPDATE/DELETE apenas para administradores
CREATE POLICY "Admins can manage role permissions" 
  ON public.role_permissions 
  FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'Administrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() AND role = 'Administrador'
    )
  );

-- 2. Corrigir incompatibilidade: atualizar enum para usar underscore
ALTER TYPE public.components RENAME VALUE 'edit-vehicle' TO 'edit_vehicle_old';
ALTER TYPE public.components ADD VALUE 'edit_vehicle';

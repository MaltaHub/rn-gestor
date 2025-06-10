
-- Primeiro, criar uma função security definer para obter o role_level do usuário atual
-- Isso evita recursão RLS e permite verificação eficiente de permissões
CREATE OR REPLACE FUNCTION public.get_current_user_role_level()
RETURNS INTEGER AS $$
  SELECT COALESCE(role_level, 0) 
  FROM public.user_profiles 
  WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Remover a política atual que verifica apenas o role
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;

-- Criar nova política que usa role_level >= 9 para operações de gerenciamento
CREATE POLICY "Users with admin level can manage role permissions" 
  ON public.role_permissions 
  FOR ALL 
  TO authenticated
  USING (
    public.get_current_user_role_level() >= 9
  )
  WITH CHECK (
    public.get_current_user_role_level() >= 9
  );

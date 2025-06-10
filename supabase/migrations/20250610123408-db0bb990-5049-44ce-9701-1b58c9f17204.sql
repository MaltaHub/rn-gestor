
-- Limpar dados corrompidos e recriar permissões de forma segura
-- Primeiro, verificar e deletar registros duplicados ou problemáticos
DELETE FROM public.role_permissions 
WHERE role = 'Usuario' AND permission_level = 1;

-- Deletar todos os registros para começar limpo
DELETE FROM public.role_permissions;

-- Inserir permissões corretas baseadas no permissionRules.ts
-- Cada role terá apenas uma entrada com seus componentes específicos

-- Administrador - acesso a inventory, vehicle_details, sales_dashboard, pendings, admin_panel
INSERT INTO public.role_permissions (role, permission_level, components) VALUES
('Administrador', 9, ARRAY['inventory'::components, 'vehicle_details'::components, 'sales_dashboard'::components, 'pendings'::components, 'admin_panel'::components]);

-- Gestor - acesso de alto nível a múltiplas áreas
INSERT INTO public.role_permissions (role, permission_level, components) VALUES
('Gestor', 5, ARRAY['inventory'::components, 'vehicle_details'::components, 'add_vehicle'::components, 'sales'::components, 'sales_dashboard'::components, 'edit_vehicle'::components, 'advertisements'::components, 'pendings'::components]);

-- Gerente - acesso de edição a múltiplas áreas
INSERT INTO public.role_permissions (role, permission_level, components) VALUES
('Gerente', 5, ARRAY['inventory'::components, 'vehicle_details'::components, 'add_vehicle'::components, 'sales'::components, 'sales_dashboard'::components, 'edit_vehicle'::components, 'advertisements'::components, 'pendings'::components]);

-- Consultor - acesso operacional limitado
INSERT INTO public.role_permissions (role, permission_level, components) VALUES
('Consultor', 2, ARRAY['inventory'::components, 'vehicle_details'::components, 'sales'::components, 'edit_vehicle'::components, 'advertisements'::components, 'pendings'::components]);

-- Usuario - acesso básico de visualização
INSERT INTO public.role_permissions (role, permission_level, components) VALUES
('Usuario', 1, ARRAY['inventory'::components, 'vehicle_details'::components, 'pendings'::components]);

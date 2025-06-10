
-- Atualizar o enum components para incluir todas as áreas do sistema
ALTER TYPE public.components ADD VALUE 'inventory';
ALTER TYPE public.components ADD VALUE 'vehicle_details';
ALTER TYPE public.components ADD VALUE 'add_vehicle';
ALTER TYPE public.components ADD VALUE 'sales';
ALTER TYPE public.components ADD VALUE 'sales_dashboard';
ALTER TYPE public.components ADD VALUE 'advertisements';
ALTER TYPE public.components ADD VALUE 'pendings';
ALTER TYPE public.components ADD VALUE 'admin_panel';

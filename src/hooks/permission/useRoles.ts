
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { UserRoleType } from '@/types/permission';

interface RolesResponse {
  roles: string[];
}

/**
 * Hook para obter a lista de cargos do sistema
 */
export const useRoles = () => {
  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<UserRoleType[]> => {
      try {
        // Chamar a edge function para buscar os cargos
        const { data, error } = await supabase.functions.invoke<RolesResponse>('ler-cargos');
        
        if (error) {
          console.error('Erro ao buscar cargos:', error);
          throw new Error('Falha ao buscar cargos');
        }
        
        if (!data || !data.roles) {
          console.warn('Nenhum cargo encontrado, usando lista padrão');
          return ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[];
        }
        
        return data.roles as UserRoleType[];
      } catch (err) {
        console.error('Erro ao buscar cargos:', err);
        toast.error('Não foi possível carregar a lista de cargos');
        // Fallback para lista padrão em caso de erro
        return ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[];
      }
    },
  });

  return {
    roles: roles || ['Usuário', 'Vendedor', 'Gerente', 'Administrador'] as UserRoleType[],
    isLoading,
    error
  };
};

export default useRoles;

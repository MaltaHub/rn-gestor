
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { UserRoleType } from "@/types/permission";

export const useRoleManagement = () => {
  const [roles, setRoles] = useState<UserRoleType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Função para buscar papéis
  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Chamamos a edge function para obter os papéis
      const { data, error } = await supabase.functions.invoke<{roles: UserRoleType[]}>("ler-cargos");
      
      if (error) {
        throw new Error(`Erro ao buscar papéis: ${error.message}`);
      }

      if (!data || !data.roles) {
        setRoles(['Usuário', 'Vendedor', 'Gerente', 'Administrador', 'Secretário']);
      } else {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error("Erro ao buscar papéis:", err);
      setError(err as Error);
      toast.error("Não foi possível carregar os papéis");
      // Fallback para lista padrão
      setRoles(['Usuário', 'Vendedor', 'Gerente', 'Administrador', 'Secretário']);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  return {
    roles,
    isLoading,
    error,
    refetchRoles: fetchRoles
  };
};

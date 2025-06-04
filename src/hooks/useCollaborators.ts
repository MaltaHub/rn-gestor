
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface Collaborator {
  id: string;
  name: string;
  role: "Consultor" | "Gestor" | "Gerente" | "Administrador";
  avatar_url: string | null;
  join_date: string | null;
  birthdate: string | null;
}

export const useCollaborators = () => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCollaborators = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, role, avatar_url, join_date, birthdate')
        .order('name');

      if (error) {
        console.error('Erro ao buscar colaboradores:', error);
        toast.error('Erro ao carregar colaboradores');
        return;
      }

      setCollaborators(data || []);
    } catch (err) {
      console.error('Erro ao buscar colaboradores:', err);
      toast.error('Erro ao carregar colaboradores');
    } finally {
      setIsLoading(false);
    }
  };

  const updateRole = async (userId: string, newRole: "Consultor" | "Gestor" | "Gerente" | "Administrador") => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        console.error('Erro ao atualizar cargo:', error);
        toast.error('Erro ao atualizar cargo');
        return false;
      }

      toast.success('Cargo atualizado com sucesso');
      await fetchCollaborators(); // Recarregar dados
      return true;
    } catch (err) {
      console.error('Erro ao atualizar cargo:', err);
      toast.error('Erro ao atualizar cargo');
      return false;
    }
  };

  useEffect(() => {
    fetchCollaborators();
  }, []);

  return {
    collaborators,
    isLoading,
    updateRole,
    refetch: fetchCollaborators
  };
};

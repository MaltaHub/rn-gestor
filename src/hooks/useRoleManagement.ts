
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  role_level: number;
  birthdate?: string;
  join_date?: string;
  avatar_url?: string;
}

export const useRoleManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('name');

      if (error) {
        console.error("Error loading users:", error);
        toast.error("Erro ao carregar usuários");
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: UserRole): Promise<boolean> => {
    try {
      // Mapear role para role_level
      const getRoleLevel = (role: UserRole): number => {
        switch (role) {
          case "Administrador": return 9;
          case "Gerente": return 8;
          case "Gestor": return 6;
          case "Consultor": return 3;
          case "Usuario": return 1;
          default: return 0;
        }
      };

      const roleLevel = getRoleLevel(role);

      const { error } = await supabase
        .from('user_profiles')
        .update({ 
          role, 
          role_level: roleLevel 
        })
        .eq('id', userId);

      if (error) {
        console.error("Error updating user role:", error);
        toast.error("Erro ao atualizar cargo do usuário");
        return false;
      }

      await loadUsers();
      toast.success("Cargo atualizado com sucesso!");
      return true;
    } catch (error) {
      console.error("Error updating user role:", error);
      toast.error("Erro ao atualizar cargo do usuário");
      return false;
    }
  };

  const updateUserRoleLevel = async (userId: string, roleLevel: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role_level: roleLevel })
        .eq('id', userId);

      if (error) {
        console.error("Error updating user role level:", error);
        toast.error("Erro ao atualizar nível do usuário");
        return false;
      }

      await loadUsers();
      toast.success("Nível atualizado com sucesso!");
      return true;
    } catch (error) {
      console.error("Error updating user role level:", error);
      toast.error("Erro ao atualizar nível do usuário");
      return false;
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return {
    users,
    isLoading,
    loadUsers,
    updateUserRole,
    updateUserRoleLevel
  };
};

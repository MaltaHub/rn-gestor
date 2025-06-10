
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea } from "@/types/permission";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

interface RolePermission {
  id: string;
  role: UserRole;
  permission_level: number;
  component: string;
}

export const usePermissionManagement = () => {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPermissions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*');

      if (error) {
        console.error("Error loading permissions:", error);
        toast.error("Erro ao carregar permissões");
        return;
      }

      setPermissions(data || []);
    } catch (error) {
      console.error("Error loading permissions:", error);
      toast.error("Erro ao carregar permissões");
    } finally {
      setIsLoading(false);
    }
  };

  const updatePermission = async (area: AppArea, role: UserRole, level: number) => {
    try {
      // Primeiro, verificar se já existe uma permissão para este role que inclui esta área
      const { data: existing, error: checkError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', role)
        .eq('component', area);

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("Error checking existing permission:", checkError);
        toast.error("Erro ao verificar permissões existentes");
        return false;
      }

      if (existing && existing.length > 0) {
        // Atualizar permissão existente
        const permission = existing[0];
        const { error: updateError } = await supabase
          .from('role_permissions')
          .update({ permission_level: level })
          .eq('id', permission.id);

        if (updateError) {
          console.error("Error updating permission:", updateError);
          toast.error("Erro ao atualizar permissão");
          return false;
        }
      } else {
        // Criar nova permissão
        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert({
            role: role,
            permission_level: level,
            component: area
          });

        if (insertError) {
          console.error("Error creating permission:", insertError);
          toast.error("Erro ao criar permissão");
          return false;
        }
      }

      await loadPermissions();
      toast.success("Permissão atualizada com sucesso!");
      return true;
    } catch (error) {
      console.error("Error updating permission:", error);
      toast.error("Erro ao atualizar permissão");
      return false;
    }
  };

  const getPermissionLevel = (area: AppArea, role: UserRole): number => {
    const permission = permissions.find(
      (p) => p.role === role && p.component === area
    );
    return permission?.permission_level || 0;
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  return {
    permissions,
    isLoading,
    loadPermissions,
    updatePermission,
    getPermissionLevel
  };
};

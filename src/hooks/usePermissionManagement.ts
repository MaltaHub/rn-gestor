
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea } from "@/types/permission";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

interface RolePermission {
  id: string;
  role: UserRole;
  permission_level: number;
  components: string[];
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
      // Primeiro, verificar se já existe uma permissão para este role e área
      const { data: existing, error: checkError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', role)
        .contains('components', [area])
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("Error checking existing permission:", checkError);
        toast.error("Erro ao verificar permissões existentes");
        return false;
      }

      if (existing) {
        // Atualizar permissão existente
        const { error: updateError } = await supabase
          .from('role_permissions')
          .update({ permission_level: level })
          .eq('id', existing.id);

        if (updateError) {
          console.error("Error updating permission:", updateError);
          toast.error("Erro ao atualizar permissão");
          return false;
        }
      } else {
        // Criar nova permissão - inserir diretamente sem upsert
        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert([{
            role: role,
            permission_level: level,
            components: [area as any] // Cast to any to bypass type checking
          }]);

        if (insertError) {
          console.error("Error creating permission:", insertError);
          toast.error("Erro ao criar permissão");
          return false;
        }
      }

      await loadPermissions();
      return true;
    } catch (error) {
      console.error("Error updating permission:", error);
      toast.error("Erro ao atualizar permissão");
      return false;
    }
  };

  const getPermissionLevel = (area: AppArea, role: UserRole): number => {
    const permission = permissions.find(p => 
      p.role === role && p.components.includes(area)
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


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

  const updatePermission = async (
    area: AppArea,
    role: UserRole,
    level: number
  ) => {
    try {
      // Primeiro, verificar se já existe uma permissão para este role que inclui esta área
      const { data: existingPermissions, error: checkError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', role)
        .eq('component', area);

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing permission:', checkError);
        toast.error('Erro ao verificar permissões existentes');
        return false;
      }

      // Verificação extra: evitar duplicidade de (role, permission_level) em áreas diferentes
      const { data: sameLevel, error: sameLevelError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', role)
        .eq('permission_level', level);

      if (sameLevelError && sameLevelError.code !== 'PGRST116') {
        console.error("Error checking same level permission:", sameLevelError);
        toast.error("Erro ao verificar duplicidade de nível");
        return false;
      }
      
      if (
        sameLevel &&
        sameLevel.length > 0 &&
        !sameLevel.some(p => p.component === area)
      ) {
        toast.error('Já existe uma permissão para este cargo com este nível em outra área. Escolha outro nível.');
        return false;
      }

      if (level === 0) {
        // Se nível 0, deletar permissão existente (se houver)
        if (existingPermissions && existingPermissions.length > 0) {
          const permission = existingPermissions[0];
          const { error: deleteError } = await supabase
            .from('role_permissions')
            .delete()
            .eq('id', permission.id);
          if (deleteError) {
            console.error("Error deleting permission:", deleteError);
            toast.error("Erro ao remover permissão");
            return false;
          }
        }
        await loadPermissions();
        toast.success("Permissão removida com sucesso!");
        return true;
      }

      if (existingPermissions && existingPermissions.length > 0) {
        const permission = existingPermissions[0];

        // Atualizar permissão existente
        const { error: updateError } = await supabase
          .from('role_permissions')
          .update({ permission_level: level })
          .eq('id', permission.id);

        if (updateError) {
          console.error('Error updating permission:', updateError);
          toast.error('Erro ao atualizar permissão');
          return false;
        }
      } else if (level > 0) {
        // Criar nova permissão somente se nível > 0
        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert({
            role: role,
            permission_level: level,
            component: area
          });

        if (insertError) {
          console.error('Error creating permission:', insertError);
          toast.error('Erro ao criar permissão');
          return false;
        }
      }

      await loadPermissions();
      toast.success(
        level === 0 ? 'Permissão removida com sucesso!' : 'Permissão atualizada com sucesso!'
      );
      return true;
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('Erro ao atualizar permissão');
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

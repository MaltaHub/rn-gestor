
import { supabase } from "@/integrations/supabase/client";
import { permissionRules } from "@/utils/permissionRules";
import { AppArea } from "@/types/permission";

export interface PermissionMatrix {
  [area: string]: {
    [role: string]: number;
  };
}

/**
 * Carrega permissões do banco e sincroniza com permissionRules
 */
export const loadPermissionsFromDatabase = async (): Promise<PermissionMatrix> => {
  try {
    const { data: dbPermissions, error } = await supabase
      .from('role_permissions')
      .select('*');

    if (error) {
      console.error("Error loading permissions from database:", error);
      return convertPermissionRulesToMatrix();
    }

    // Converter dados do banco para matriz de permissões
    const matrix: PermissionMatrix = {};
    
    // Inicializar com dados do permissionRules
    Object.keys(permissionRules).forEach(area => {
      matrix[area] = { ...permissionRules[area as AppArea].roles };
    });

    // Sobrescrever com dados do banco
    dbPermissions?.forEach(permission => {
      permission.components.forEach((component: string) => {
        if (!matrix[component]) {
          matrix[component] = {};
        }
        matrix[component][permission.role] = permission.permission_level;
      });
    });

    return matrix;
  } catch (error) {
    console.error("Error in loadPermissionsFromDatabase:", error);
    return convertPermissionRulesToMatrix();
  }
};

/**
 * Converte permissionRules para formato de matriz
 */
export const convertPermissionRulesToMatrix = (): PermissionMatrix => {
  const matrix: PermissionMatrix = {};
  
  Object.entries(permissionRules).forEach(([area, rule]) => {
    matrix[area] = { ...rule.roles };
  });
  
  return matrix;
};

/**
 * Sincroniza permissionRules com o banco de dados
 */
export const syncPermissionsToDatabase = async () => {
  try {
    // Limpar permissões existentes
    await supabase.from('role_permissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Inserir permissões do permissionRules
    const insertData: any[] = [];
    
    Object.entries(permissionRules).forEach(([area, rule]) => {
      Object.entries(rule.roles).forEach(([role, level]) => {
        // Verificar se já existe entrada para este role
        const existingEntry = insertData.find(item => item.role === role);
        
        if (existingEntry) {
          existingEntry.components.push(area);
        } else {
          insertData.push({
            role,
            permission_level: level,
            components: [area]
          });
        }
      });
    });

    const { error } = await supabase
      .from('role_permissions')
      .insert(insertData);

    if (error) {
      console.error("Error syncing permissions to database:", error);
      return false;
    }

    console.log("Permissions synced successfully");
    return true;
  } catch (error) {
    console.error("Error in syncPermissionsToDatabase:", error);
    return false;
  }
};

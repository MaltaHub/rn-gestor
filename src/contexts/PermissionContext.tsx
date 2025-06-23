import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, PermissionContextType } from "@/types/permission";

// Create the context
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissionLevels, setPermissionLevels] = useState<Record<AppArea, number>>({
    inventory: 0,
    vehicle_details: 0,
    add_vehicle: 0,
    sales: 0,
    sales_dashboard: 0,
    edit_vehicle: 0,
    advertisements: 0,
    pendings: 0,
    admin_panel: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);
  const [roleLevel, setRoleLevel] = useState<number | null>(null);

  // Function to create a user profile if it doesn't exist
  const createUserProfile = async (userId: string, name: string, birthdate?: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          role: 'Usuario',
          role_level: 1,
          birthdate: birthdate || null
        });

      if (error) {
        console.error("Error creating user profile:", error);
        toast.error("Error creating user profile");
        return;
      }

      // Reload permissions
      loadUserProfileAndPermissions();
    } catch (error) {
      console.error("Error creating user profile:", error);
      toast.error("Error creating user profile");
    }
  };

  // Function to complete the profile of the logged-in user
  const completeUserProfile = async (name: string, birthdate: string) => {
    if (!user) return false;
    
    try {
      setIsLoading(true);
      
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData.user) {
        console.error("Error getting authenticated user:", authError);
        toast.error("Error verifying authentication");
        return false;
      }
      
      const userId = authData.user.id;
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name,
          birthdate
        })
        .eq('id', userId);
        
      if (error) {
        console.error("Error updating profile:", error);
        toast.error("Error updating profile");
        return false;
      }
      
      toast.success("Profile updated successfully");
      
      // Reload permissions after updating profile
      await loadUserProfileAndPermissions();
      return true;
    } catch (error) {
      console.error("Error completing profile:", error);
      toast.error("Error completing user profile");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Load user profile and permissions from database
  const loadUserProfileAndPermissions = async () => {
    if (!user) {
      setIsLoading(false);
      setProfileExists(false);
      setPermissionLevels({
        inventory: 0,
        vehicle_details: 0,
        add_vehicle: 0,
        sales: 0,
        sales_dashboard: 0,
        edit_vehicle: 0,
        advertisements: 0,
        pendings: 0,
        admin_panel: 0
      });
      setRoleLevel(null);
      return;
    }

    try {
      setIsLoading(true);
      
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, name, birthdate, role_level')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        setProfileExists(false);
        return;
      }

      if (!profileData) {
        console.warn("No profile found for user ID:", user.id);
        setProfileExists(false);
        setUserRole(null);
        setRoleLevel(null);
        return;
      }

      console.log("Profile found:", profileData);
      setProfileExists(true);
      setUserRole(profileData.role);
      setRoleLevel(profileData.role_level || null);

      // Fetch permissions for this role from database
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('role_permissions')
        .select('component, permission_level')
        .eq('role', profileData.role);

      if (permissionsError) {
        console.error("Error fetching permissions:", permissionsError);
        return;
      }

      // Build permission levels from database data
      const finalPermissions: Record<AppArea, number> = {
        inventory: 0,
        vehicle_details: 0,
        add_vehicle: 0,
        sales: 0,
        sales_dashboard: 0,
        edit_vehicle: 0,
        advertisements: 0,
        pendings: 0,
        admin_panel: 0
      };

      if (permissionsData && permissionsData.length > 0) {
        permissionsData.forEach((perm) => {
          if (perm.component in finalPermissions) {
            finalPermissions[perm.component as AppArea] = perm.permission_level;
          }
        });
      }

      setPermissionLevels(finalPermissions);
      console.log("Permissões carregadas do banco:", finalPermissions);
    } catch (error) {
      console.error("Erro ao carregar permissões:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load profile and permissions when user changes
  useEffect(() => {
    loadUserProfileAndPermissions();
  }, [user]);

  // Function to check if the user has sufficient permission for an area
  // Implementa a lógica de nível mínimo: se o usuário tem o nível requerido ou maior, tem acesso
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    console.log(`Verificando permissão: área=${area}, nível requerido=${requiredLevel}, nível atual=${permissionLevels[area]}, role_level=${roleLevel}`);
    
    if (!user) return false;

    // Verificar permissão específica da área primeiro
    if (permissionLevels[area] >= requiredLevel) {
      return true;
    }

    // Verificar role_level como fallback para admins
    if (roleLevel !== null && roleLevel >= 9 && area === 'admin_panel') {
      return true;
    }

    return false;
  };

  // Função para verificar se o usuário é super admin (nível 9)
  const isSuperAdmin = (): boolean => {
    return roleLevel !== null && roleLevel >= 9;
  };

  // Função para verificar se o usuário pode editar permissões
  const canEditPermissions = (): boolean => {
    return isSuperAdmin();
  };

  return (
    <PermissionContext.Provider value={{ 
      userRole, 
      permissionLevels, 
      checkPermission, 
      isLoading,
      createUserProfile,
      completeUserProfile,
      profileExists,
      roleLevel,
      isSuperAdmin,
      canEditPermissions
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

// Hook to use the permission context
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
};


import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AppArea, PermissionContextType } from "@/types/permission";
import { fetchUserProfileAndPermissions } from "@/utils/permissionUtils";

// Create the context
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissionLevels, setPermissionLevels] = useState<Record<AppArea, number>>({
    inventory: 1, // Nível mínimo para visualização
    vehicle_details: 0,
    add_vehicle: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);

  // Function to create a user profile if it doesn't exist
  const createUserProfile = async (userId: string, name: string, birthdate?: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          role: 'Consultor',
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
      
      // Get the current user to ensure we have the correct ID
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData.user) {
        console.error("Error getting authenticated user:", authError);
        toast.error("Error verifying authentication");
        return false;
      }
      
      const userId = authData.user.id;
      console.log("Completing profile for user ID:", userId);
      
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

  // Load user profile and permissions
  const loadUserProfileAndPermissions = async () => {
    if (!user) {
      setIsLoading(false);
      setProfileExists(false);
      setPermissionLevels({
        inventory: 1, // Todos podem ver o estoque por padrão
        vehicle_details: 0,
        add_vehicle: 0
      });
      return;
    }

    try {
      setIsLoading(true);
      const result = await fetchUserProfileAndPermissions(user.id);
      
      setProfileExists(result.profileExists);
      setUserRole(result.userRole);
      
      // Garantir que as permissões mínimas estejam sempre presentes
      const updatedPermissions = {
        ...result.permissionLevels,
        inventory: Math.max(result.permissionLevels.inventory, 1) // Garantir no mínimo nível 1 para inventory
      };
      
      setPermissionLevels(updatedPermissions);
      console.log("Permissões carregadas:", updatedPermissions);
    } catch (error) {
      console.error("Erro ao carregar permissões:", error);
      // Definir permissões padrão mesmo em caso de erro
      setPermissionLevels({
        inventory: 1,
        vehicle_details: 0,
        add_vehicle: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load profile and permissions when user changes
  useEffect(() => {
    loadUserProfileAndPermissions();
  }, [user]);

  // Function to check if the user has sufficient permission for an area
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    console.log(`Verificando permissão: área=${area}, nível requerido=${requiredLevel}, nível atual=${permissionLevels[area]}`);
    
    // A visualização do estoque é garantida para todos os usuários logados
    if (area === 'inventory' && requiredLevel === 1) {
      return user !== null;
    }
    
    if (!user) return false;
    
    return permissionLevels[area] >= requiredLevel;
  };

  return (
    <PermissionContext.Provider value={{ 
      userRole, 
      permissionLevels, 
      checkPermission, 
      isLoading,
      createUserProfile,
      completeUserProfile,
      profileExists
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

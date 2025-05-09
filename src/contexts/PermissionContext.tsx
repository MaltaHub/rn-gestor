
import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

// Tipos de áreas da aplicação
type AppArea = 'inventory' | 'vehicle_details' | 'add_vehicle';

// Interface para o contexto de permissões
interface PermissionContextType {
  userRole: string | null;
  checkPermission: (area: AppArea, requiredLevel: number) => boolean;
  permissionLevels: Record<AppArea, number>;
  isLoading: boolean;
}

// Criar o contexto
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissionLevels, setPermissionLevels] = useState<Record<AppArea, number>>({
    inventory: 0,
    vehicle_details: 0,
    add_vehicle: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  // Buscar o perfil do usuário e suas permissões
  useEffect(() => {
    const fetchUserProfileAndPermissions = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Buscar o perfil do usuário
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error("Erro ao buscar perfil:", profileError);
          toast.error("Erro ao carregar informações de perfil");
          setIsLoading(false);
          return;
        }

        if (profileData) {
          setUserRole(profileData.role);
          
          // Buscar as permissões para este papel
          const { data: permissionsData, error: permissionsError } = await supabase
            .from('role_permissions')
            .select('area, permission_level')
            .eq('role', profileData.role);

          if (permissionsError) {
            console.error("Erro ao buscar permissões:", permissionsError);
            toast.error("Erro ao carregar informações de permissões");
          } else if (permissionsData) {
            // Mapear as permissões por área
            const levels: Record<AppArea, number> = {
              inventory: 0,
              vehicle_details: 0,
              add_vehicle: 0
            };
            
            permissionsData.forEach(p => {
              levels[p.area as AppArea] = p.permission_level;
            });
            
            setPermissionLevels(levels);
          }
        }
      } catch (error) {
        console.error("Erro ao verificar permissões:", error);
        toast.error("Erro ao verificar permissões");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserProfileAndPermissions();
  }, [user]);

  // Função para verificar se o usuário tem permissão suficiente para uma área
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    if (!user) return false;
    return permissionLevels[area] >= requiredLevel;
  };

  return (
    <PermissionContext.Provider value={{ 
      userRole, 
      permissionLevels, 
      checkPermission, 
      isLoading 
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

// Hook para usar o contexto de permissões
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
};


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
  createUserProfile: (userId: string, name: string, birthdate?: string) => Promise<void>;
  completeUserProfile: (name: string, birthdate: string) => Promise<boolean>;
  profileExists: boolean;
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
  const [profileExists, setProfileExists] = useState(false);

  // Função para criar um perfil de usuário caso não exista
  const createUserProfile = async (userId: string, name: string, birthdate?: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          role: 'Vendedor',
          birthdate: birthdate || null
        });

      if (error) {
        console.error("Erro ao criar perfil:", error);
        toast.error("Erro ao completar perfil de usuário");
        return;
      }
      
      toast.success("Perfil completado com sucesso");
      // Recarregar as permissões
      fetchUserProfileAndPermissions();
    } catch (error) {
      console.error("Erro ao criar perfil:", error);
      toast.error("Erro ao completar perfil de usuário");
    }
  };

  // Função para completar o perfil do usuário logado
  const completeUserProfile = async (name: string, birthdate: string) => {
    if (!user) return false;
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          name,
          role: 'Vendedor',
          birthdate
        });

      if (error) {
        console.error("Erro ao completar perfil:", error);
        toast.error("Erro ao completar perfil de usuário");
        return false;
      }
      
      toast.success("Perfil completado com sucesso");
      // Recarregar as permissões
      await fetchUserProfileAndPermissions();
      return true;
    } catch (error) {
      console.error("Erro ao completar perfil:", error);
      toast.error("Erro ao completar perfil de usuário");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Buscar o perfil do usuário e suas permissões
  const fetchUserProfileAndPermissions = async () => {
    if (!user) {
      setIsLoading(false);
      setProfileExists(false);
      return;
    }

    try {
      // Buscar o perfil do usuário
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, name, birthdate')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Erro ao buscar perfil:", profileError);
        toast.error("Erro ao carregar informações de perfil");
        setIsLoading(false);
        setProfileExists(false);
        return;
      }

      if (profileData) {
        setProfileExists(true);
        setUserRole(profileData.role);
        
        // Verificar se faltam dados no perfil (nome ou data de nascimento)
        if (!profileData.name || !profileData.birthdate) {
          // Se faltarem dados, ainda consideramos que o perfil não está completo
          setProfileExists(false);
        }
        
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
      } else {
        // Se não houver perfil, definir um papel padrão temporário
        setUserRole('Vendedor');
        setProfileExists(false);
      }
    } catch (error) {
      console.error("Erro ao verificar permissões:", error);
      toast.error("Erro ao verificar permissões");
      setProfileExists(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfileAndPermissions();
  }, [user]);

  // Função para verificar se o usuário tem permissão suficiente para uma área
  const checkPermission = (area: AppArea, requiredLevel: number): boolean => {
    if (!user || !profileExists) return false;
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

// Hook para usar o contexto de permissões
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
};

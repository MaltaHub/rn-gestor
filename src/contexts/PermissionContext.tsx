
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
      // Verificar se o perfil já existe antes de tentar criar
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (checkError) {
        console.error("Erro ao verificar perfil existente:", checkError);
        toast.error("Erro ao verificar perfil de usuário");
        return;
      }

      // Se o perfil já existe, atualiza em vez de inserir
      if (existingProfile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            name,
            role: 'Vendedor',
            birthdate: birthdate || null
          })
          .eq('id', userId);

        if (updateError) {
          console.error("Erro ao atualizar perfil:", updateError);
          toast.error("Erro ao atualizar perfil de usuário");
          return;
        }
      } else {
        // Inserir novo perfil
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            name,
            role: 'Vendedor',
            birthdate: birthdate || null
          });

        if (insertError) {
          console.error("Erro ao criar perfil:", insertError);
          toast.error("Erro ao criar perfil de usuário");
          return;
        }
      }
      
      toast.success("Perfil completado com sucesso");
      // Recarregar as permissões
      fetchUserProfileAndPermissions();
    } catch (error) {
      console.error("Erro ao gerenciar perfil:", error);
      toast.error("Erro ao gerenciar perfil de usuário");
    }
  };

  // Função para completar o perfil do usuário logado
  const completeUserProfile = async (name: string, birthdate: string) => {
    if (!user) return false;
    
    try {
      setIsLoading(true);
      
      // Importante: Obter o usuário atual da sessão para garantir que temos o ID correto
      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData.user) {
        console.error("Erro ao obter usuário autenticado:", authError);
        toast.error("Erro ao verificar autenticação");
        return false;
      }
      
      const userId = authData.user.id;
      console.log("Completando perfil para o usuário ID:", userId);
      
      // Verificar se o perfil já existe antes de tentar criar ou atualizar
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("Erro ao verificar perfil existente:", checkError);
        toast.error("Erro ao verificar perfil de usuário");
        return false;
      }

      let operationError;
      
      // Se o perfil já existe, atualiza em vez de inserir
      if (existingProfile) {
        console.log("Perfil existente, atualizando...");
        const { error } = await supabase
          .from('user_profiles')
          .update({
            name,
            birthdate
          })
          .eq('id', userId);
        
        operationError = error;
      } else {
        // Inserir novo perfil
        console.log("Criando novo perfil...");
        const { error } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            name,
            role: 'Vendedor',
            birthdate
          });
        
        operationError = error;
      }

      if (operationError) {
        console.error("Erro ao completar perfil:", operationError);
        toast.error("Erro ao completar perfil de usuário");
        return false;
      }
      
      console.log("Perfil atualizado com sucesso!");
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
      console.log("Verificando perfil para o usuário:", user.id);
      
      // Buscar o perfil do usuário
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, name, birthdate')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error("Erro ao buscar perfil:", profileError);
        toast.error("Erro ao carregar informações de perfil");
        setIsLoading(false);
        setProfileExists(false);
        return;
      }

      if (profileData) {
        console.log("Perfil encontrado:", profileData);
        setProfileExists(true);
        setUserRole(profileData.role);
        
        // Verificar se faltam dados no perfil (nome ou data de nascimento)
        if (!profileData.name || !profileData.birthdate) {
          console.log("Perfil incompleto, faltando dados");
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
            if (p.area && p.permission_level !== undefined) {
              levels[p.area as AppArea] = p.permission_level;
            }
          });
          
          setPermissionLevels(levels);
        }
      } else {
        console.log("Nenhum perfil encontrado, definindo papel padrão");
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

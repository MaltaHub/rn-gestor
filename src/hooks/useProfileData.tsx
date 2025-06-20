
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface ProfileData {
  name: string;
  birthdate: string;
  role: string | null;
  avatarUrl: string | null;
  isLoading: boolean;
  updateAvatar: (url: string) => void;
}

export const useProfileData = (): ProfileData => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateAvatar = (url: string) => {
    setAvatarUrl(url);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        console.log("Buscando perfil para o usuário ID:", user.id);

        // Get the current user to ensure we have the correct ID
        const { data: authData, error: authError } = await supabase.auth.getUser();
        
        if (authError || !authData.user) {
          console.error("Error getting authenticated user:", authError);
          toast.error("Error verifying authentication");
          setIsLoading(false);
          return;
        }
        
        const userId = authData.user.id;
        
        const { data, error } = await supabase
          .from('user_profiles')
          .select('name, role, birthdate, avatar_url')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.error('Erro ao buscar perfil:', error);
          toast.error('Erro ao carregar informações de perfil');
          setIsLoading(false);
          return;
        }

        if (data) {
          console.warn("Dados do perfil encontrados:", data);
          setName(data.name || "");
          setRole(data.role);
          setBirthdate(data.birthdate || "");
          setAvatarUrl(data.avatar_url);
        } else {
          // Create a default profile if none exists
          console.log("Perfil não encontrado, criando perfil padrão");
          const defaultName = user.name || user.email?.split('@')[0] || "Usuário";
          
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: userId,
              name: defaultName,
              role: 'Usuario',
              avatar_url: null
            });
            
          if (insertError) {
            console.error("Erro ao criar perfil padrão:", insertError);
            toast.error("Erro ao criar perfil padrão");
          } else {
            // Set values after creating default profile
            setName(defaultName);
            setRole("Consultor");
            setAvatarUrl(null);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        toast.error('Erro ao carregar informações de perfil');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  return {
    name,
    birthdate,
    role,
    avatarUrl,
    isLoading,
    updateAvatar
  };
};

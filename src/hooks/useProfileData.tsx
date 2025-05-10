
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface ProfileData {
  name: string;
  birthdate: string;
  role: string | null;
  isLoading: boolean;
}

export const useProfileData = (): ProfileData => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        console.log("Buscando perfil para o usuário ID:", user.id);
        const { data, error } = await supabase
          .from('user_profiles')
          .select('name, role, birthdate')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Erro ao buscar perfil:', error);
          toast.error('Erro ao carregar informações de perfil');
          return;
        }

        if (data) {
          console.log("Dados do perfil encontrados:", data);
          setName(data.name || "");
          setRole(data.role);
          setBirthdate(data.birthdate || "");
        } else {
          // Perfil não existe
          console.log("Perfil não encontrado, usando dados do usuário");
          setName(user.name || user.email?.split('@')[0] || "");
          setRole("Vendedor");
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
    isLoading
  };
};

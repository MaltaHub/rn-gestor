
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

export const useProfileData = () => {
  const [name, setName] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [joinDate, setJoinDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuth();

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Fetch user profile data
        const { data, error } = await supabase
          .from('user_profiles')
          .select('name, birthdate, bio, avatar_url, join_date')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Error fetching profile:', error);
          toast.error('Erro ao carregar informações do perfil');
        } else if (data) {
          setName(data.name);
          setBirthdate(data.birthdate);
          setBio(data.bio);
          setAvatarUrl(data.avatar_url);
          setJoinDate(data.join_date);
        }
      } catch (err) {
        console.error('Error in profile data fetch:', err);
        toast.error('Erro ao carregar dados do perfil');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [user]);

  // Function to update profile data
  const updateProfile = async (updates: {
    name?: string;
    birthdate?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
  }) => {
    if (!user) return { success: false };

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        toast.error('Erro ao atualizar perfil');
        return { success: false };
      }

      // Update local state with the new values
      if (updates.name) setName(updates.name);
      if ('birthdate' in updates) setBirthdate(updates.birthdate);
      if ('bio' in updates) setBio(updates.bio);
      if ('avatar_url' in updates) setAvatarUrl(updates.avatar_url);

      toast.success('Perfil atualizado com sucesso');
      return { success: true };
    } catch (err) {
      console.error('Error in profile update:', err);
      toast.error('Erro ao atualizar perfil');
      return { success: false };
    }
  };

  return {
    name,
    birthdate,
    bio,
    avatarUrl,
    joinDate,
    isLoading,
    updateProfile
  };
};


import React, { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import { EditableField } from "./form/EditableField";
import { RoleField } from "./form/RoleField";
import { ProfileActions } from "./form/ProfileActions";

interface ProfileDetailsFormProps {
  user: User | null;
  name: string;
  birthdate: string;
  role: string | null;
  bio: string;
  avatarUrl: string;
  joinDate: string;
  onLogout: () => Promise<void>;
}

const ProfileDetailsForm: React.FC<ProfileDetailsFormProps> = ({
  user,
  name: initialName,
  birthdate: initialBirthdate,
  bio: initialBio,
  avatarUrl: initialAvatarUrl,
  joinDate: initialJoinDate,
  role,
  onLogout
}) => {
  const [name, setName] = useState(initialName);
  const [birthdate, setBirthdate] = useState(initialBirthdate);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [joinDate, setJoinDate] = useState(initialJoinDate);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      // Obter o usuário atual novamente para ter certeza de que estamos com dados atualizados
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        throw new Error("Usuário não autenticado");
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ 
          name, 
          birthdate, 
          bio, 
          avatar_url: avatarUrl, 
          join_date: joinDate 
        })
        .eq('id', authData.user.id);

      if (error) {
        console.error('Erro ao atualizar perfil:', error);
        toast.error('Erro ao atualizar perfil');
        return;
      }

      toast.success('Perfil atualizado com sucesso');
      setIsEditing(false);
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
      toast.error('Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <EditableField 
        id="name"
        label="Nome Completo"
        value={name}
        onChange={setName}
        isEditing={isEditing}
        placeholder="Seu nome completo"
      />
      
      <EditableField 
        id="birthdate"
        label="Data de Nascimento"
        value={birthdate}
        onChange={setBirthdate}
        isEditing={isEditing}
        type="date"
        maxDate={today}
      />
      
      <EditableField 
        id="bio"
        label="Biografia"
        value={bio}
        onChange={setBio}
        isEditing={isEditing}
        type="textarea"
        placeholder="Conte um pouco sobre sua experiência profissional"
      />

      <EditableField 
        id="avatarUrl"
        label="URL do Avatar"
        value={avatarUrl}
        onChange={setAvatarUrl}
        isEditing={isEditing}
        placeholder="https://exemplo.com/seu-avatar.jpg"
      />

      <EditableField 
        id="joinDate"
        label="Data de Início"
        value={joinDate}
        onChange={setJoinDate}
        isEditing={isEditing}
        type="date"
        maxDate={today}
      />
      
      <EditableField 
        id="email"
        label="E-mail"
        value={user?.email || ""}
        onChange={() => {}}
        isEditing={false}
      />
      
      <RoleField role={role} />
      
      <ProfileActions 
        isEditing={isEditing}
        isSaving={isSaving}
        onSave={handleSaveProfile}
        onCancel={() => setIsEditing(false)}
        onEdit={() => setIsEditing(true)}
        onLogout={onLogout}
      />
    </>
  );
};

export default ProfileDetailsForm;

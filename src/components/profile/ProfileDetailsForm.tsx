
import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import { usePermission } from "@/contexts/PermissionContext";

interface ProfileDetailsFormProps {
  user: User | null;
  name: string;
  birthdate: string;
  role: string | null;
  onLogout: () => Promise<void>;
}

const ProfileDetailsForm: React.FC<ProfileDetailsFormProps> = ({
  user,
  name: initialName,
  birthdate: initialBirthdate,
  role,
  onLogout
}) => {
  const [name, setName] = useState(initialName);
  const [birthdate, setBirthdate] = useState(initialBirthdate);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Removida verificação de permissão - todos podem editar seus próprios perfis

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
        .update({ name, birthdate })
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
      <div className="space-y-3">
        <Label htmlFor="name">Nome Completo</Label>
        {isEditing ? (
          <Input 
            id="name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Seu nome completo"
          />
        ) : (
          <Input id="name" value={name} readOnly />
        )}
      </div>
      
      <div className="space-y-3">
        <Label htmlFor="birthdate">Data de Nascimento</Label>
        {isEditing ? (
          <Input 
            id="birthdate"
            type="date" 
            value={birthdate} 
            onChange={(e) => setBirthdate(e.target.value)}
          />
        ) : (
          <Input 
            id="birthdate" 
            value={birthdate ? new Date(birthdate).toISOString().split('T')[0] : ""} 
            readOnly 
          />
        )}
      </div>
      
      <div className="space-y-3">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" value={user?.email || ""} readOnly />
      </div>
      
      <div className="space-y-3">
        <Label htmlFor="role">Função</Label>
        <Select disabled value={role || undefined}>
          <SelectTrigger id="role">
            <SelectValue placeholder="Selecione uma função" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Vendedor">Vendedor</SelectItem>
            <SelectItem value="Gerente">Gerente</SelectItem>
            <SelectItem value="Administrador">Administrador</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          Somente administradores podem alterar funções de usuários.
        </p>
      </div>
      
      <div className="pt-4 space-y-3">
        {isEditing ? (
          <div className="flex space-x-3">
            <Button 
              onClick={handleSaveProfile} 
              className="flex-1 bg-vehicleApp-red hover:bg-red-600"
              disabled={isSaving}
            >
              {isSaving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                'Salvar'
              )}
            </Button>
            <Button 
              onClick={() => setIsEditing(false)} 
              variant="outline" 
              className="flex-1"
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <>
            {/* Removida a verificação de permissão - todos podem editar o perfil */}
            <Button 
              onClick={() => setIsEditing(true)} 
              className="w-full bg-vehicleApp-red hover:bg-red-600"
            >
              Editar Perfil
            </Button>
            <Button 
              onClick={onLogout} 
              variant="outline" 
              className="w-full"
            >
              Sair da Conta
            </Button>
          </>
        )}
      </div>
    </>
  );
};

export default ProfileDetailsForm;

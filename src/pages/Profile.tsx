
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { userRole, isLoading } = usePermission();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('name, role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Erro ao buscar perfil:', error);
          toast.error('Erro ao carregar informações de perfil');
          return;
        }

        if (data) {
          setName(data.name || "");
          setRole(data.role);
        }
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        toast.error('Erro ao carregar informações de perfil');
      }
    };

    fetchProfile();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ name })
        .eq('id', user.id);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-vehicleApp-red"></div>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Perfil do Usuário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="name">Nome</Label>
            {isEditing ? (
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Seu nome"
              />
            ) : (
              <Input id="name" value={name} readOnly />
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
                  {isSaving ? 'Salvando...' : 'Salvar'}
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
              <Button 
                onClick={() => setIsEditing(true)} 
                className="w-full bg-vehicleApp-red hover:bg-red-600"
              >
                Editar Perfil
              </Button>
            )}
            <Button 
              onClick={logout} 
              variant="outline" 
              className="w-full"
            >
              Sair da Conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;

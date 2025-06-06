import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { Loader2 } from "lucide-react";
import { useProfileData } from "@/hooks/useProfileData";
import ProfileDetailsForm from "@/components/profile/ProfileDetailsForm";
import AvatarUpload from "@/components/profile/AvatarUpload";

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { isLoading: permissionsLoading } = usePermission();
  const { name, birthdate, role, avatarUrl, isLoading: profileDataLoading, updateAvatar } = useProfileData();

  const isLoading = permissionsLoading || profileDataLoading;

  const roleLabels: Record<string, string> = {
    Usuario: "Consultor",
    Gestor: "Gestor",
    Gerente: "Gerente",
    Administrador: "Administrador",
    Vendedor: "Vendedor",
    // Adicione outros cargos conforme necessário
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Foto de Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <AvatarUpload
              currentAvatar={avatarUrl}
              userName={name}
              onAvatarUpdate={updateAvatar}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perfil do Usuário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProfileDetailsForm 
              user={user} 
              name={name} 
              birthdate={birthdate} 
              role={role} 
              onLogout={logout} 
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;

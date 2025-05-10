
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { Loader2 } from "lucide-react";
import { useProfileData } from "@/hooks/useProfileData";
import CompleteProfileForm from "@/components/profile/CompleteProfileForm";
import ProfileDetailsForm from "@/components/profile/ProfileDetailsForm";

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { isLoading: permissionsLoading, profileExists } = usePermission();
  const { name, birthdate, role, isLoading: profileDataLoading } = useProfileData();

  const isLoading = permissionsLoading || profileDataLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>{profileExists ? "Perfil do Usuário" : "Complete seu Perfil"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!profileExists ? (
            <CompleteProfileForm initialValues={{ name, birthdate }} />
          ) : (
            <ProfileDetailsForm 
              user={user} 
              name={name} 
              birthdate={birthdate} 
              role={role} 
              onLogout={logout} 
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;

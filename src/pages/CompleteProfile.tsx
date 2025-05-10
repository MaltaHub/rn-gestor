
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import CompleteProfileForm from "@/components/profile/CompleteProfileForm";
import { useProfileData } from "@/hooks/useProfileData";
import { Navigate } from "react-router-dom";

const CompleteProfile: React.FC = () => {
  const { user } = useAuth();
  const { 
    name, 
    birthdate, 
    bio, 
    avatarUrl,
    joinDate, 
    isLoading: profileDataLoading 
  } = useProfileData();

  if (profileDataLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // Se o usuário já tiver todos os campos completos, redirecionar para o inventário
  if (name && birthdate && bio && avatarUrl && joinDate) {
    return <Navigate to="/inventory" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-vehicleApp-lightGray px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Complete seu Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <CompleteProfileForm 
            initialValues={{
              name: name || user?.email?.split('@')[0] || '',
              birthdate: birthdate || '',
              bio: bio || '',
              avatarUrl: avatarUrl || '',
              joinDate: joinDate || new Date().toISOString().split('T')[0]
            }} 
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default CompleteProfile;

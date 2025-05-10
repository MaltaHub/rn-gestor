
import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children?: React.ReactNode;
  requireCompleteProfile?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireCompleteProfile = true 
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const { profileExists, isLoading: permissionLoading } = usePermission();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Só consideramos a verificação concluída quando auth e permissões estão carregadas
    if (!authLoading && !permissionLoading) {
      setIsChecking(false);
    }
  }, [authLoading, permissionLoading]);

  if (isChecking || authLoading || permissionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-vehicleApp-red"></div>
      </div>
    );
  }

  // Se o usuário não estiver autenticado, redireciona para o login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Se for necessário perfil completo e o perfil não existir, redireciona para completar perfil
  if (requireCompleteProfile && !profileExists) {
    console.log("Perfil não existe. Redirecionando para completar perfil.");
    return <Navigate to="/complete-profile" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;

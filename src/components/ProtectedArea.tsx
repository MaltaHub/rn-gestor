
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermission } from "@/contexts/PermissionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

type AppArea = 'inventory' | 'vehicle_details' | 'add_vehicle';

interface ProtectedAreaProps {
  area: AppArea;
  requiredLevel: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectIfProfileIncomplete?: boolean;
}

const ProtectedArea: React.FC<ProtectedAreaProps> = ({ 
  area, 
  requiredLevel, 
  children, 
  fallback,
  redirectIfProfileIncomplete = true
}) => {
  const { checkPermission, isLoading: permissionLoading, profileExists } = usePermission();
  const { user, isLoading: authLoading } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const location = useLocation();
  
  const isLoading = permissionLoading || authLoading;

  // Reset redirecting state when route changes
  useEffect(() => {
    return () => setIsRedirecting(false);
  }, [location.pathname]);

  // Mostrar o loader enquanto carrega as permissões
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // Se o usuário não estiver autenticado, redirecionar para o login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Verificar se tem permissão antes de verificar perfil incompleto
  const hasPermission = checkPermission(area, requiredLevel);
  
  // Se não tem permissão, exibir o conteúdo de fallback ou redirecionar
  if (!hasPermission) {
    console.log(`Usuário sem permissão para área: ${area}, nível requerido: ${requiredLevel}`);
    return fallback ? (
      <>{fallback}</>
    ) : (
      <Navigate to="/inventory" replace />
    );
  }

  // Só redirecionar para o perfil se estiver incompleto, não estiver já redirecionando,
  // não estiver já na página de perfil e a flag de redirecionamento estiver ativa
  if (redirectIfProfileIncomplete && !profileExists && !isRedirecting && !location.pathname.includes('/profile')) {
    console.log("Redirecionando para completar perfil");
    setIsRedirecting(true);
    return <Navigate to="/profile" replace />;
  }

  // Se tem permissão e o perfil está completo (ou não requer redirecionamento), exibir o conteúdo protegido
  return <>{children}</>;
};

export default ProtectedArea;

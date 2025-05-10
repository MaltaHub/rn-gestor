
import React from "react";
import { Navigate } from "react-router-dom";
import { usePermission } from "@/contexts/PermissionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

type AppArea = 'inventory' | 'vehicle_details' | 'add_vehicle';

interface ProtectedAreaProps {
  area: AppArea;
  requiredLevel: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ProtectedArea: React.FC<ProtectedAreaProps> = ({ 
  area, 
  requiredLevel, 
  children, 
  fallback 
}) => {
  const { checkPermission, isLoading } = usePermission();
  const { user } = useAuth();

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

  // Verificar se o usuário tem permissão
  const hasPermission = checkPermission(area, requiredLevel);

  // Se não tem permissão, exibir o conteúdo de fallback ou redirecionar
  if (!hasPermission) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <Navigate to="/inventory" replace />
    );
  }

  // Se tem permissão, exibir o conteúdo protegido
  return <>{children}</>;
};

export default ProtectedArea;

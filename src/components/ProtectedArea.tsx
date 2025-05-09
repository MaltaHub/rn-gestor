
import React from "react";
import { Navigate } from "react-router-dom";
import { usePermission } from "@/contexts/PermissionContext";

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-vehicleApp-red"></div>
      </div>
    );
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

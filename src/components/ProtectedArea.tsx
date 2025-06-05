import React from "react";
import { Navigate } from "react-router-dom";
import { checkPermission } from "@/services/permissionService";
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
  const { user, isLoading: authLoading } = useAuth();
  const { userRole, roleLevel, isLoading: permissionLoading } = usePermission();
  
  const isLoading = permissionLoading || authLoading;

  // Show loader while permissions are loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // If user is not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const { hasAccess, reason } = checkPermission(area, userRole, roleLevel);

  // If no permission, show fallback content or redirect
  if (!hasAccess) {
    console.log(`Usuário sem permissão para área: ${area}, nível requerido: ${requiredLevel}`);
    return fallback ? (
      <>{fallback}</>
    ) : (
      <Navigate to="/inventory" replace />
    );
  }

  // If has permission, show protected content
  return <>{children}</>;
};

export default ProtectedArea;

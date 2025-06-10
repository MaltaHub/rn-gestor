
import React from "react";
import { usePermission } from "@/contexts/PermissionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

import { AppArea } from "@/types/permission";

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
  const { permissionLevels, roleLevel, isLoading: permissionLoading } = usePermission();

  const isLoading = permissionLoading || authLoading;

  // Show loader while permissions are loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // Render fallback or error message within the layout
  const renderFallback = (content: React.ReactNode) => (
    <div className="p-8 text-center">
      {content}
    </div>
  );

  // If user is not authenticated, show fallback
  if (!user) {
    return renderFallback(fallback ?? <div>Você não está autenticado.</div>);
  }

  // Check area-specific permission first
  const areaPermissionLevel = permissionLevels[area] || 0;
  const hasAreaPermission = areaPermissionLevel >= requiredLevel;

  // For admin panel, also check role_level as fallback
  const hasRoleLevelPermission = area === 'admin_panel' && roleLevel !== null && roleLevel >= 9;

  const hasAccess = hasAreaPermission || hasRoleLevelPermission;

  console.log(`ProtectedArea check: area=${area}, requiredLevel=${requiredLevel}, areaLevel=${areaPermissionLevel}, roleLevel=${roleLevel}, hasAccess=${hasAccess}`);

  if (!hasAccess) {
    return renderFallback(fallback ?? (
      <div>
        <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
        <p className="text-gray-700">Você não tem permissão para acessar esta área.</p>
      </div>
    ));
  }

  return <>{children}</>;
};

export default ProtectedArea;

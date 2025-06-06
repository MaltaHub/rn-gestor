import React from "react";
import { checkPermission } from "@/services/permissionService";
import { usePermission } from "@/contexts/PermissionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { permissionRules } from "@/utils/permissionRules";

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

  const rule = permissionRules[area];

  // Render fallback or error message within the layout
  const renderFallback = (content: React.ReactNode) => (
    <div className="p-8 text-center">
      {content}
    </div>
  );

  // If user is not authenticated, show fallback as children
  if (!user) {
    return renderFallback(fallback ?? <div>Você não está autenticado.</div>);
  }

  if (!rule) {
    return renderFallback(fallback ?? <div>Área não encontrada.</div>);
  }

  if (rule.type === "page" && roleLevel < requiredLevel) {
    return renderFallback(fallback ?? (
      <div>
        <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
        <p className="text-gray-700">Você não tem permissão para acessar esta página.</p>
      </div>
    ));
  }

  if (rule.type === "functionality" && roleLevel < requiredLevel) {
    return renderFallback(fallback ?? (
      <div>
        <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
        <p className="text-gray-700">Você não tem permissão para acessar esta funcionalidade.</p>
      </div>
    ));
  }

  const { hasAccess, reason } = checkPermission(area, userRole, roleLevel);

  if (!hasAccess) {
    console.warn(reason);
    return renderFallback(fallback ?? (
      <div>
        <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
        <p className="text-gray-700">Você não tem permissão para acessar esta área.</p>
      </div>
    ));
  }

  // If has permission, show protected content, senão mostra o fallback no lugar do children
  if (!user || !rule || (rule.type === "page" && roleLevel < requiredLevel) || (rule.type === "functionality" && roleLevel < requiredLevel) || !checkPermission(area, userRole, roleLevel).hasAccess) {
    return <>{fallback ?? null}</>;
  }
  return <>{children}</>;
};

export default ProtectedArea;

import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { checkPermission } from "@/services/permissionService";
import { usePermission } from "@/contexts/PermissionContext";
import { AppArea } from "@/types/permission";

interface ProtectedRouteProps {
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { userRole, roleLevel, isLoading: permissionLoading, profileExists } = usePermission();
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();

  const isLoading = permissionLoading || authLoading;

  if (isLoading || !profileExists) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-vehicleApp-red"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  /*
  const area = location.pathname === "/" ? "inventory" : location.pathname.replace("/", "");

  const { hasAccess, reason } = checkPermission(area as AppArea, userRole, roleLevel);

  if (!hasAccess) {
    console.warn(reason);
    return <Navigate to="/not-authorized" replace state={{ from: location }} />;
  }
  */

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;

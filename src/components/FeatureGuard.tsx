
import React from "react";
import { useFeaturePermissions } from "@/contexts/FeaturePermissionsContext";
import { FeatureId } from "@/types/featurePermissions";
import { Loader2 } from "lucide-react";

interface FeatureGuardProps {
  featureId: FeatureId;
  customLevel?: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const FeatureGuard: React.FC<FeatureGuardProps> = ({
  featureId,
  customLevel,
  children,
  fallback
}) => {
  const { checkFeaturePermission, isLoading } = useFeaturePermissions();
  
  // Show loader while permissions are loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-2">
        <Loader2 className="h-4 w-4 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // Check if user has permission for this feature
  const hasPermission = checkFeaturePermission(featureId, customLevel);
  
  // If no permission, show fallback content or nothing
  if (!hasPermission) {
    return fallback ? <>{fallback}</> : null;
  }

  // If has permission, show the content
  return <>{children}</>;
};

export default FeatureGuard;

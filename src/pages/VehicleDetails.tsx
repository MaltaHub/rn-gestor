
import React from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useVehicles } from "@/contexts/VehicleContext";
import { useFeaturePermissions } from "@/contexts/FeaturePermissionsContext";
import { NotFoundCard } from "@/components/vehicle-details/NotFoundCard";
import { VehicleHeader } from "@/components/vehicle-details/VehicleHeader";
import { VehicleDetailsContent } from "@/components/vehicle-details/VehicleDetailsContent";
import { useVehicleDetailState } from "@/hooks/useVehicleDetailState";
import FeatureGuard from "@/components/FeatureGuard";

const VehicleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { getVehicle } = useVehicles();
  const { hasFeaturePermission } = useFeaturePermissions();
  
  // Check if user has edit permission
  const canEdit = hasFeaturePermission('edit-vehicle');
  
  const vehicle = getVehicle(id || "");
  
  if (!vehicle) {
    return <NotFoundCard />;
  }
  
  const {
    isEditing,
    isSaving,
    isDeleting,
    editedVehicle,
    handleInputChange,
    handleStatusChange,
    handleUpdate,
    handleDelete,
    handleCancelEdit,
    setIsEditing
  } = useVehicleDetailState(vehicle, canEdit);

  return (
    <div className="content-container py-6">
      <VehicleHeader
        vehicle={vehicle}
        isEditing={isEditing}
        isSaving={isSaving}
        isDeleting={isDeleting}
        canEdit={canEdit}
        onEdit={() => setIsEditing(true)}
        onCancel={handleCancelEdit}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      
      <FeatureGuard 
        featureId="view-vehicle-details" 
        fallback={<div className="p-8 text-center">Você não tem permissão para visualizar detalhes do veículo.</div>}
      >
        <Card>
          <VehicleDetailsContent
            vehicle={vehicle}
            editedVehicle={editedVehicle}
            isEditing={isEditing}
            handleInputChange={handleInputChange}
            handleStatusChange={handleStatusChange}
          />
        </Card>
      </FeatureGuard>
    </div>
  );
};

export default VehicleDetailsPage;

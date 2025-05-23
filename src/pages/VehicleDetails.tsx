
import React from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useVehicles } from "@/contexts/VehicleContext";
import { NotFoundCard } from "@/components/vehicle-details/NotFoundCard";
import { VehicleHeader } from "@/components/vehicle-details/VehicleHeader";
import { VehicleDetailsContent } from "@/components/vehicle-details/VehicleDetailsContent";
import { useVehicleDetailState } from "@/hooks/useVehicleDetailState";

const VehicleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { getVehicle } = useVehicles();
  
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
  } = useVehicleDetailState(vehicle, true);

  return (
    <div className="content-container py-6">
      <VehicleHeader
        vehicle={vehicle}
        isEditing={isEditing}
        isSaving={isSaving}
        isDeleting={isDeleting}
        onEdit={() => setIsEditing(true)}
        onCancel={handleCancelEdit}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      
      <Card>
        <VehicleDetailsContent
          vehicle={vehicle}
          editedVehicle={editedVehicle}
          isEditing={isEditing}
          handleInputChange={handleInputChange}
          handleStatusChange={handleStatusChange}
        />
      </Card>
    </div>
  );
};

export default VehicleDetailsPage;


import React from "react";
import { Button } from "@/components/ui/button";
import { CardTitle, CardHeader } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { VehicleActions } from "./VehicleActions";
import { Vehicle } from "@/types";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  isEditing: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export const VehicleHeader: React.FC<VehicleHeaderProps> = ({
  vehicle,
  isEditing,
  isSaving,
  isDeleting,
  canEdit,
  onEdit,
  onCancel,
  onUpdate,
  onDelete
}) => {
  const navigate = useNavigate();

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Estoque
        </Button>
      </div>
      
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-2xl">
          {vehicle.model}
        </CardTitle>
        
        <VehicleActions
          vehicle={vehicle}
          isEditing={isEditing}
          isSaving={isSaving}
          isDeleting={isDeleting}
          canEdit={canEdit}
          onEdit={onEdit}
          onCancel={onCancel}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      </CardHeader>
    </>
  );
};

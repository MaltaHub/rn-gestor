
import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Vehicle } from "@/types";

interface VehicleDescriptionProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const VehicleDescription: React.FC<VehicleDescriptionProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange
}) => {
  return (
    <div>
      <Label>Descrição</Label>
      {isEditing ? (
        <Textarea
          name="description"
          value={editedVehicle.description || ""}
          onChange={handleInputChange}
          rows={4}
          className="mt-2"
        />
      ) : (
        <p className="mt-2 text-vehicleApp-darkGray whitespace-pre-line">
          {vehicle.description || "Sem descrição disponível."}
        </p>
      )}
    </div>
  );
};


import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Vehicle } from "@/types";

interface VehicleImageProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const VehicleImage: React.FC<VehicleImageProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange
}) => {
  return (
    <div className="h-full max-h-96">
      <img 
        src={isEditing ? editedVehicle.imageUrl : vehicle.imageUrl}
        alt={vehicle.model}
        className="w-full h-full object-cover rounded-lg"
      />
      {isEditing && (
        <div className="mt-2">
          <Label htmlFor="imageUrl">URL da Imagem</Label>
          <Input
            id="imageUrl"
            name="imageUrl"
            value={editedVehicle.imageUrl}
            onChange={handleInputChange}
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
};

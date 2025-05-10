
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Vehicle } from "@/types";

interface VehicleSpecificationsProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const VehicleSpecifications: React.FC<VehicleSpecificationsProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange
}) => {
  return (
    <div>
      <h2 className="text-lg font-semibold">Especificações</h2>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <div>
          <Label>Motor</Label>
          {isEditing ? (
            <Input
              name="specifications.engine"
              value={editedVehicle.specifications?.engine || ""}
              onChange={handleInputChange}
              className="mt-1"
            />
          ) : (
            <p className="text-vehicleApp-darkGray">{vehicle.specifications?.engine || "-"}</p>
          )}
        </div>
        <div>
          <Label>Transmissão</Label>
          {isEditing ? (
            <Input
              name="specifications.transmission"
              value={editedVehicle.specifications?.transmission || ""}
              onChange={handleInputChange}
              className="mt-1"
            />
          ) : (
            <p className="text-vehicleApp-darkGray">{vehicle.specifications?.transmission || "-"}</p>
          )}
        </div>
        <div>
          <Label>Combustível</Label>
          {isEditing ? (
            <Input
              name="specifications.fuel"
              value={editedVehicle.specifications?.fuel || ""}
              onChange={handleInputChange}
              className="mt-1"
            />
          ) : (
            <p className="text-vehicleApp-darkGray">{vehicle.specifications?.fuel || "-"}</p>
          )}
        </div>
      </div>
    </div>
  );
};

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CalendarDays, MapPin, Calculator, Tag, Info } from "lucide-react";
import { Vehicle } from "@/types";

interface VehicleBasicInfoProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleStatusChange: (value: string) => void;
}

export const VehicleBasicInfo: React.FC<VehicleBasicInfoProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange,
  handleStatusChange
}) => {
  return (
    <div>
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Info className="h-4 w-4" />
        Informações Básicas
      </h2>
      <div className="mt-3 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Placa</Label>
            {isEditing ? (
              <Input
                name="plate"
                value={editedVehicle.plate}
                onChange={handleInputChange}
                className="mt-1"
              />
            ) : (
              <p className="font-medium text-black">{vehicle.plate}</p>
            )}
          </div>
          <div>
            <Label>Status</Label>
            {isEditing ? (
              <Select
                value={editedVehicle.status}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1">
                <StatusBadge status={vehicle.status} />
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Ano</Label>
            {isEditing ? (
              <Input
                type="number"
                name="year"
                value={editedVehicle.year}
                onChange={handleInputChange}
                className="mt-1"
              />
            ) : (
              <div className="flex items-center mt-1">
                <CalendarDays className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                <span>{vehicle.year}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Cor</Label>
            {isEditing ? (
              <Input
                name="color"
                value={editedVehicle.color}
                onChange={handleInputChange}
                className="mt-1"
              />
            ) : (
              <div className="flex items-center mt-1">
                <MapPin className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                <span>{vehicle.color}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Quilometragem</Label>
            {isEditing ? (
              <Input
                type="number"
                name="mileage"
                value={editedVehicle.mileage}
                onChange={handleInputChange}
                className="mt-1"
              />
            ) : (
              <div className="flex items-center mt-1">
                <Calculator className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                <span>{vehicle.mileage.toLocaleString()} km</span>
              </div>
            )}
          </div>
          <div>
            <Label>Preço</Label>
            {isEditing ? (
              <Input
                type="number"
                name="price"
                value={editedVehicle.price}
                onChange={handleInputChange}
                className="mt-1"
              />
            ) : (
              <div className="flex items-center mt-1">
                <Tag className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                <span className={`font-bold ${vehicle.status === 'available' ? 'text-vehicleApp-red' : ''}`}>
                  R$ {vehicle.price.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

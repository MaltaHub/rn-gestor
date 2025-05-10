
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Vehicle } from "@/types";
import { StatusBadge } from "@/components/common/StatusBadge";

interface VehicleCardProps {
  vehicle: Vehicle;
  onClick: () => void;
}

export const CompactVehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onClick }) => {
  return (
    <Card className="overflow-hidden hover:shadow-md cursor-pointer transition-shadow" onClick={onClick}>
      <CardContent className="p-0">
        <div className="flex items-center">
          <div className="h-24 w-24 sm:h-28 sm:w-28 flex-shrink-0">
            <img
              src={vehicle.imageUrl}
              alt={vehicle.model}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 p-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-black text-lg">{vehicle.model}</h3>
              <StatusBadge status={vehicle.status} />
            </div>
            <p className="text-vehicleApp-mediumGray text-sm">{vehicle.plate}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-vehicleApp-mediumGray">
                {vehicle.year} • {vehicle.mileage.toLocaleString()} km
              </div>
              <div className={`font-bold ${
                vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'
              }`}>
                R$ {vehicle.price.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const DetailedVehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onClick }) => {
  return (
    <Card className="overflow-hidden hover:shadow-md cursor-pointer transition-shadow" onClick={onClick}>
      <CardContent className="p-0">
        <div className="relative h-48">
          <img
            src={vehicle.imageUrl}
            alt={vehicle.model}
            className="h-full w-full object-cover"
          />
          <div className="absolute top-2 right-2">
            <StatusBadge status={vehicle.status} />
          </div>
        </div>
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-black text-lg">{vehicle.model}</h3>
            <div className={`font-bold ${
              vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'
            }`}>
              R$ {vehicle.price.toLocaleString()}
            </div>
          </div>
          <p className="text-vehicleApp-mediumGray text-sm">{vehicle.plate}</p>
          
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">Ano:</span>
              <span className="ml-1">{vehicle.year}</span>
            </div>
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">Cor:</span>
              <span className="ml-1">{vehicle.color}</span>
            </div>
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">KM:</span>
              <span className="ml-1">{vehicle.mileage.toLocaleString()}</span>
            </div>
            {vehicle.specifications?.engine && (
              <div className="flex items-center text-vehicleApp-darkGray">
                <span className="font-medium">Motor:</span>
                <span className="ml-1">{vehicle.specifications.engine}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

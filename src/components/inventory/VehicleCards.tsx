
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { VehicleWithIndicators } from "@/types";
import { StatusBadge } from "@/components/vehicle-details/StatusBadge";
import { VehicleIndicators } from "@/components/vehicle-indicators/VehicleIndicators";

interface VehicleCardProps {
  vehicle: VehicleWithIndicators;
  onClick: () => void;
  isSelected?: boolean;
  onToggleSelect?: (vehicleId: string) => void;
}

export const CompactVehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  onClick,
  isSelected = false,
  onToggleSelect
}) => {
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.checkbox-container')) {
      return; 
    }
    onClick();
  };

  const handleCheckboxChange = () => {
    onToggleSelect?.(vehicle.id);
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md cursor-pointer transition-all ${
      isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
    }`} onClick={handleCardClick}>
      <CardContent className="p-0">
        <div className="flex items-center">
          {onToggleSelect && (
            <div className="checkbox-container p-2 md:p-3 flex items-center">
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                className="touch-friendly"
              />
            </div>
          )}
          
          <div className="h-20 w-20 md:h-28 md:w-28 flex-shrink-0">
            <img src={vehicle.image_url} alt={vehicle.model} className="h-full w-full object-cover" />
          </div>
          
          <div className="flex-1 p-2 md:p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1 md:gap-2">
                <h3 className="font-bold text-black text-sm md:text-lg">{vehicle.model}</h3>
                <div className="mobile-hidden">
                  <VehicleIndicators vehicle={vehicle} />
                </div>
              </div>
              <StatusBadge status={vehicle.status} />
            </div>
            <p className="text-vehicleApp-mediumGray text-xs md:text-sm">{vehicle.plate}</p>
            
            {vehicle.local && (
              <p className="text-xs text-blue-600 mt-1 mobile-hidden">📍 {vehicle.local}</p>
            )}
            
            {vehicle.documentacao && (
              <p className="text-xs text-purple-600 mt-1 mobile-hidden">📄 {vehicle.documentacao}</p>
            )}
            
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs md:text-sm text-vehicleApp-mediumGray">
                <span className="desktop-hidden">{vehicle.year}</span>
                <span className="mobile-hidden">{vehicle.year} • {vehicle.mileage.toLocaleString()} km</span>
              </div>
              <div className={`font-bold text-sm md:text-base ${vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'}`}>
                R$ {vehicle.price.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const DetailedVehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  onClick,
  isSelected = false,
  onToggleSelect
}) => {
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.checkbox-container')) {
      return;
    }
    onClick();
  };

  const handleCheckboxChange = () => {
    onToggleSelect?.(vehicle.id);
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md cursor-pointer transition-all ${
      isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
    }`} onClick={handleCardClick}>
      <CardContent className="p-0">
        <div className="relative h-36 md:h-48">
          <img src={vehicle.image_url} alt={vehicle.model} className="h-full w-full object-cover" />
          <div className="absolute top-2 right-2">
            <StatusBadge status={vehicle.status} />
          </div>
          <div className="absolute top-2 left-2 mobile-hidden">
            <VehicleIndicators vehicle={vehicle} />
          </div>
          {onToggleSelect && (
            <div className="checkbox-container absolute bottom-2 left-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                className="bg-white border-2 touch-friendly"
              />
            </div>
          )}
        </div>
        <div className="mobile-compact">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-black text-sm md:text-lg">{vehicle.model}</h3>
            <div className={`font-bold text-sm md:text-base ${vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'}`}>
              R$ {vehicle.price.toLocaleString()}
            </div>
          </div>
          <p className="text-vehicleApp-mediumGray text-xs md:text-sm">{vehicle.plate}</p>
          
          {vehicle.local && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                📍 {vehicle.local}
              </span>
            </div>
          )}
          
          {vehicle.documentacao && (
            <div className="flex items-center gap-1 mt-1 mobile-hidden">
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                📄 {vehicle.documentacao}
              </span>
            </div>
          )}
          
          <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs md:text-sm">
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
              <div className="flex items-center text-vehicleApp-darkGray mobile-hidden">
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

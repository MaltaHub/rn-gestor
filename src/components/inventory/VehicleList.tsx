
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Vehicle } from "@/types";
import { CompactVehicleCard, DetailedVehicleCard } from "./VehicleCards";

interface VehicleListProps {
  isLoading: boolean;
  filteredVehicles: Vehicle[];
  viewMode: 'compact' | 'detailed';
  onVehicleClick: (vehicleId: string) => void;
}

export const VehicleList: React.FC<VehicleListProps> = ({
  isLoading,
  filteredVehicles,
  viewMode,
  onVehicleClick
}) => {
  if (isLoading) {
    return (
      <div className={`grid gap-4 ${viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {[1, 2, 3, 4, 5].map((item) => (
          <Card key={item} className="overflow-hidden">
            <CardContent className="p-0">
              {viewMode === 'compact' ? (
                <div className="flex items-center">
                  <Skeleton className="h-24 w-24 sm:h-28 sm:w-28" />
                  <div className="flex-1 p-3 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <div className="flex items-center justify-between mt-2">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <Skeleton className="h-48 w-full" />
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                    <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (filteredVehicles.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-xl font-medium text-gray-600">Nenhum veículo encontrado</h3>
        <p className="mt-2 text-gray-500">Tente ajustar sua pesquisa ou adicionar novos veículos</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
      {filteredVehicles.map((vehicle) => (
        viewMode === 'compact' ? (
          <CompactVehicleCard 
            key={vehicle.id}
            vehicle={vehicle}
            onClick={() => onVehicleClick(vehicle.id)}
          />
        ) : (
          <DetailedVehicleCard 
            key={vehicle.id}
            vehicle={vehicle}
            onClick={() => onVehicleClick(vehicle.id)}
          />
        )
      ))}
    </div>
  );
};

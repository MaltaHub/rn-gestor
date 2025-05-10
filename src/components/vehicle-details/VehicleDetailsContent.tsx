
import React from "react";
import { Vehicle } from "@/types";
import { CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehicleImage } from "./VehicleImage";
import { VehicleBasicInfo } from "./VehicleBasicInfo";
import { Separator } from "@/components/ui/separator";
import { VehicleSpecifications } from "./VehicleSpecifications";
import { VehicleDescription } from "./VehicleDescription";
import { VehicleHistory } from "./VehicleHistory";

interface VehicleDetailsContentProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleStatusChange: (value: string) => void;
}

export const VehicleDetailsContent: React.FC<VehicleDetailsContentProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange,
  handleStatusChange
}) => {
  return (
    <CardContent className="space-y-8">
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="details">Detalhes</TabsTrigger>
          <TabsTrigger value="history">Histórico de Alterações</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <VehicleImage
              vehicle={vehicle}
              editedVehicle={editedVehicle}
              isEditing={isEditing}
              handleInputChange={handleInputChange}
            />
            
            <div className="space-y-6">
              <VehicleBasicInfo 
                vehicle={vehicle}
                editedVehicle={editedVehicle}
                isEditing={isEditing}
                handleInputChange={handleInputChange}
                handleStatusChange={handleStatusChange}
              />
              
              <Separator />
              
              <VehicleSpecifications
                vehicle={vehicle}
                editedVehicle={editedVehicle}
                isEditing={isEditing}
                handleInputChange={handleInputChange}
              />
            </div>
          </div>
          
          <VehicleDescription
            vehicle={vehicle}
            editedVehicle={editedVehicle}
            isEditing={isEditing}
            handleInputChange={handleInputChange}
          />
        </TabsContent>
        
        <TabsContent value="history">
          <VehicleHistory vehicleId={vehicle.id} />
        </TabsContent>
      </Tabs>
    </CardContent>
  );
};

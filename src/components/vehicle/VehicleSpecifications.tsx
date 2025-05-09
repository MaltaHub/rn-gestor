
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UseFormRegister } from "react-hook-form";
import { VehicleFormData } from "@/types/forms";

interface VehicleSpecificationsProps {
  register: UseFormRegister<VehicleFormData>;
}

export const VehicleSpecifications: React.FC<VehicleSpecificationsProps> = ({
  register
}) => {
  return (
    <div className="space-y-4">
      <h3 className="font-medium">Especificações</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="engine">Motor</Label>
          <Input
            id="engine"
            placeholder="2.0"
            {...register("specifications.engine")}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="transmission">Transmissão</Label>
          <Input
            id="transmission"
            placeholder="Automático"
            {...register("specifications.transmission")}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="fuel">Combustível</Label>
          <Input
            id="fuel"
            placeholder="Flex"
            {...register("specifications.fuel")}
          />
        </div>
      </div>
    </div>
  );
};

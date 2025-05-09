
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
          <Label htmlFor="engine">Motor/Potência</Label>
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

        <div className="space-y-2">
          <Label htmlFor="renavam">Renavam</Label>
          <Input
            id="renavam"
            placeholder="12345678901"
            {...register("specifications.renavam")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="chassi">Chassi</Label>
          <Input
            id="chassi"
            placeholder="9BRBL12E0E1234567"
            {...register("specifications.chassi")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tipoCarroceria">Tipo de Carroceria</Label>
          <Input
            id="tipoCarroceria"
            placeholder="Sedan"
            {...register("specifications.tipoCarroceria")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="municipio">Município</Label>
          <Input
            id="municipio"
            placeholder="São Paulo"
            {...register("specifications.municipio")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="uf">UF</Label>
          <Input
            id="uf"
            placeholder="SP"
            {...register("specifications.uf")}
            maxLength={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="valorFipe">Valor FIPE</Label>
          <Input
            id="valorFipe"
            placeholder="R$ 50.000,00"
            {...register("specifications.valorFipe")}
            readOnly
          />
        </div>
      </div>
    </div>
  );
};

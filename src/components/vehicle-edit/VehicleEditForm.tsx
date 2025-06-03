
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Vehicle } from "@/types";
import { Info, Car, Settings } from "lucide-react";

interface VehicleEditFormProps {
  vehicle: Vehicle;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onStatusChange: (value: string) => void;
}

export const VehicleEditForm: React.FC<VehicleEditFormProps> = ({
  vehicle,
  onInputChange,
  onStatusChange
}) => {
  return (
    <div className="space-y-8">
      {/* Imagem */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Car className="h-4 w-4" />
          Imagem do Veículo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64">
            <img 
              src={vehicle.imageUrl}
              alt={vehicle.model}
              className="w-full h-full object-cover rounded-lg border"
            />
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="imageUrl">URL da Imagem</Label>
              <Input
                id="imageUrl"
                name="imageUrl"
                value={vehicle.imageUrl}
                onChange={onInputChange}
                placeholder="https://exemplo.com/imagem.jpg"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Informações Básicas */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Info className="h-4 w-4" />
          Informações Básicas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="model">Modelo</Label>
            <Input
              id="model"
              name="model"
              value={vehicle.model}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="plate">Placa</Label>
            <Input
              id="plate"
              name="plate"
              value={vehicle.plate}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="color">Cor</Label>
            <Input
              id="color"
              name="color"
              value={vehicle.color}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="year">Ano</Label>
            <Input
              id="year"
              name="year"
              type="number"
              value={vehicle.year}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="mileage">Quilometragem</Label>
            <Input
              id="mileage"
              name="mileage"
              type="number"
              value={vehicle.mileage}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="price">Preço</Label>
            <Input
              id="price"
              name="price"
              type="number"
              value={vehicle.price}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={vehicle.status}
              onValueChange={onStatusChange}
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
          </div>
        </div>
      </div>

      <Separator />

      {/* Especificações */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4" />
          Especificações
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="specifications.engine">Motor</Label>
            <Input
              id="specifications.engine"
              name="specifications.engine"
              value={vehicle.specifications?.engine || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="specifications.transmission">Transmissão</Label>
            <Input
              id="specifications.transmission"
              name="specifications.transmission"
              value={vehicle.specifications?.transmission || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="specifications.fuel">Combustível</Label>
            <Input
              id="specifications.fuel"
              name="specifications.fuel"
              value={vehicle.specifications?.fuel || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Descrição */}
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          value={vehicle.description || ""}
          onChange={onInputChange}
          rows={4}
          className="mt-2"
          placeholder="Descrição detalhada do veículo..."
        />
      </div>
    </div>
  );
};

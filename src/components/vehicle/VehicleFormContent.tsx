
import React from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LicensePlateSearch } from "@/components/vehicle/LicensePlateSearch";
import { BasicVehicleInfo } from "@/components/vehicle/BasicVehicleInfo";
import { VehicleSpecifications } from "@/components/vehicle/VehicleSpecifications";
import { VehicleFormData } from "@/types/forms";

interface VehicleFormContentProps {
  plate: string;
  isSearching: boolean;
  onPlateChange: (value: string) => void;
  onPlateSearchSuccess: (data: any) => void;
  setIsSearching: (value: boolean) => void;
}

export const VehicleFormContent: React.FC<VehicleFormContentProps> = ({
  plate,
  isSearching,
  onPlateChange,
  onPlateSearchSuccess,
  setIsSearching
}) => {
  const { register, formState: { errors } } = useFormContext<VehicleFormData>();
  
  return (
    <>
      {/* License Plate Search Component */}
      <LicensePlateSearch
        plate={plate}
        isSearching={isSearching}
        onPlateChange={onPlateChange}
        onSuccess={onPlateSearchSuccess}
        error={errors.plate?.message}
        setIsSearching={setIsSearching}
      />
      
      {/* Basic Vehicle Information Component */}
      <BasicVehicleInfo 
        register={register}
        errors={errors}
      />
      
      {/* Image URL Input */}
      <div className="space-y-2">
        <Label htmlFor="imageUrl">URL da Imagem*</Label>
        <Input
          id="imageUrl"
          placeholder="https://example.com/car-image.jpg"
          {...register("imageUrl", { 
            required: "Campo obrigatório",
            pattern: {
              value: /^https?:\/\/.+/,
              message: "Digite uma URL válida"
            }
          })}
        />
        {errors.imageUrl && <p className="text-red-500 text-sm">{errors.imageUrl.message}</p>}
      </div>
      
      {/* Description Textarea */}
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          placeholder="Descreva o veículo em detalhes..."
          rows={3}
          {...register("description")}
        />
        {errors.description && <p className="text-red-500 text-sm">{errors.description.message}</p>}
      </div>
      
      {/* Vehicle Specifications Component */}
      <VehicleSpecifications register={register} />
    </>
  );
};

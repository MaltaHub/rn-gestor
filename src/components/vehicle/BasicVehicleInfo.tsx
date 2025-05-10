
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormContext, FieldErrors } from "react-hook-form";
import { VehicleFormData } from "@/types/forms";

export const BasicVehicleInfo: React.FC = () => {
  const { register, formState: { errors } } = useFormContext<VehicleFormData>();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label htmlFor="marca">Marca*</Label>
        <Input
          id="marca"
          placeholder="Toyota"
          {...register("marca")}
        />
        {errors.marca && <p className="text-red-500 text-sm">{errors.marca.message}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="model">Modelo*</Label>
        <Input
          id="model"
          placeholder="Corolla"
          {...register("model", { required: "Campo obrigatório" })}
        />
        {errors.model && <p className="text-red-500 text-sm">{errors.model.message}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="color">Cor*</Label>
        <Input
          id="color"
          placeholder="Prata"
          {...register("color", { required: "Campo obrigatório" })}
        />
        {errors.color && <p className="text-red-500 text-sm">{errors.color.message}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="mileage">Quilometragem*</Label>
        <Input
          id="mileage"
          type="number"
          min="0"
          placeholder="45000"
          {...register("mileage", { 
            required: "Campo obrigatório",
            valueAsNumber: true,
            min: { value: 0, message: "Deve ser maior que 0" }
          })}
        />
        {errors.mileage && <p className="text-red-500 text-sm">{errors.mileage.message}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="price">Preço*</Label>
        <Input
          id="price"
          type="number"
          min="0"
          placeholder="75000"
          {...register("price", { 
            required: "Campo obrigatório",
            valueAsNumber: true,
            min: { value: 0, message: "Deve ser maior que 0" }
          })}
        />
        {errors.price && <p className="text-red-500 text-sm">{errors.price.message}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="year">Ano*</Label>
        <Input
          id="year"
          type="number"
          min="1900"
          placeholder={new Date().getFullYear().toString()}
          {...register("year", { 
            required: "Campo obrigatório",
            valueAsNumber: true,
            min: { value: 1900, message: "Ano inválido" },
            max: { value: new Date().getFullYear() + 1, message: "Ano inválido" }
          })}
        />
        {errors.year && <p className="text-red-500 text-sm">{errors.year.message}</p>}
      </div>
    </div>
  );
};

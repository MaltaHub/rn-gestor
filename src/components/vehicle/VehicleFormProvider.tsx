
import React from "react";
import { UseFormReturn } from "react-hook-form";
import { VehicleFormData } from "@/types/forms";

interface VehicleFormProviderProps {
  children: React.ReactNode;
  formMethods: UseFormReturn<VehicleFormData>;
  onSubmit: (data: VehicleFormData) => Promise<void>;
}

export const VehicleFormProvider: React.FC<VehicleFormProviderProps> = ({ 
  children, 
  formMethods, 
  onSubmit 
}) => {
  const { handleSubmit } = formMethods;
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {children}
    </form>
  );
};

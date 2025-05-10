
import React from "react";
import { UseFormReturn, FormProvider } from "react-hook-form";
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
    <FormProvider {...formMethods}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {children}
      </form>
    </FormProvider>
  );
};

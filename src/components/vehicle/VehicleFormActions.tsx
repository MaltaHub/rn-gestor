
import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface VehicleFormActionsProps {
  isSubmitting: boolean;
  onCancel: () => void;
}

export const VehicleFormActions: React.FC<VehicleFormActionsProps> = ({
  isSubmitting,
  onCancel
}) => {
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" className="bg-vehicleApp-red hover:bg-red-600" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          "Adicionar Veículo"
        )}
      </Button>
    </>
  );
};

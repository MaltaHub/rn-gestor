
import React from "react";
import { Button } from "@/components/ui/button";
import { CardTitle, CardHeader } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Vehicle } from "@/types";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  isEditing: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export const VehicleHeader: React.FC<VehicleHeaderProps> = ({
  vehicle,
  isEditing,
  isSaving,
  isDeleting,
  onEdit,
  onCancel,
  onUpdate,
  onDelete
}) => {
  const navigate = useNavigate();

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Estoque
        </Button>
      </div>
      
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-2xl">
          {vehicle.model}
        </CardTitle>
        
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button 
                size="sm" 
                onClick={onUpdate}
                disabled={isSaving}
                className="bg-vehicleApp-red hover:bg-red-600"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onEdit}
              >
                Editar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={onDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : "Excluir"}
              </Button>
            </>
          )}
        </div>
      </CardHeader>
    </>
  );
};

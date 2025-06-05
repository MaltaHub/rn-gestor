import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, PenLine, Loader2, Edit, History } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Vehicle } from "@/types";
import { useNavigate } from "react-router-dom";
import { VehicleHistoryModal } from "@/components/vehicle-history/VehicleHistoryModal";
import { usePermission } from "@/contexts/PermissionContext";

interface VehicleActionsProps {
  vehicle: Vehicle;
  isEditing: boolean;
  isSaving: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export const VehicleActions: React.FC<VehicleActionsProps> = ({
  vehicle,
  isEditing,
  isSaving,
  canEdit,
  onEdit,
  onCancel,
  onUpdate,
  onDelete
}) => {
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);
  const { userRole } = usePermission();

  const handleGoToEditPage = () => {
    navigate(`/edit-vehicle/${vehicle.id}`);
  };

  if (isEditing) {
    return (
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onCancel}
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
      </div>
    );
  }
  
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2"
        >
          <History className="h-4 w-4" />
          Ver Histórico
        </Button>
        
        {canEdit && (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGoToEditPage}
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar Veículo
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onEdit}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Edição Rápida
            </Button>
            {userRole === "admin" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir veículo</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">
                      Sim, excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>

      <VehicleHistoryModal
        vehicleId={vehicle.id}
        vehicleName={`${vehicle.model} - ${vehicle.plate}`}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </>
  );
};

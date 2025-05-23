
import React from "react";
import { Vehicle } from "@/types";
import { Button } from "@/components/ui/button";
import { Edit, ChevronLeft, Save, Trash2, X, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/common/StatusBadge";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  isEditing: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export const VehicleHeader: React.FC<VehicleHeaderProps> = ({
  vehicle,
  isEditing,
  isSaving,
  isDeleting,
  onEdit,
  onCancel,
  onUpdate,
  onDelete,
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
      <div className="flex items-center gap-2">
        <Button
          as={Link}
          to="/inventory"
          variant="outline"
          size="icon"
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          Detalhes do Veículo
          <StatusBadge status={vehicle.status} className="ml-2" />
        </h1>
      </div>

      <div className="flex gap-2 w-full sm:w-auto">
        {isEditing ? (
          <>
            <Button
              onClick={onCancel}
              variant="outline"
              className="px-3 h-9 flex-1 sm:flex-auto"
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={onUpdate}
              disabled={isSaving}
              className="px-3 h-9 flex-1 sm:flex-auto"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={onEdit}
              variant="outline"
              className="px-3 h-9 flex-1 sm:flex-auto"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button
              onClick={onDelete}
              disabled={isDeleting}
              variant="destructive"
              className="px-3 h-9 flex-1 sm:flex-auto"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Excluir
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

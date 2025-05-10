
import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface EditModeActionsProps {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export const EditModeActions: React.FC<EditModeActionsProps> = ({ 
  onSave, 
  onCancel, 
  isSaving 
}) => {
  return (
    <div className="flex space-x-3">
      <Button 
        onClick={onSave} 
        className="flex-1 bg-vehicleApp-red hover:bg-red-600"
        disabled={isSaving}
      >
        {isSaving ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
        ) : (
          'Salvar'
        )}
      </Button>
      <Button 
        onClick={onCancel} 
        variant="outline" 
        className="flex-1"
        disabled={isSaving}
      >
        Cancelar
      </Button>
    </div>
  );
};

interface ViewModeActionsProps {
  onEdit: () => void;
  onLogout: () => void;
}

export const ViewModeActions: React.FC<ViewModeActionsProps> = ({ 
  onEdit, 
  onLogout 
}) => {
  return (
    <>
      <Button 
        onClick={onEdit} 
        className="w-full bg-vehicleApp-red hover:bg-red-600"
      >
        Editar Perfil
      </Button>
      <Button 
        onClick={onLogout} 
        variant="outline" 
        className="w-full"
      >
        Sair da Conta
      </Button>
    </>
  );
};

interface ProfileActionsProps {
  isEditing: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onLogout: () => void;
}

export const ProfileActions: React.FC<ProfileActionsProps> = ({
  isEditing,
  isSaving,
  onSave,
  onCancel,
  onEdit,
  onLogout
}) => {
  return (
    <div className="pt-4 space-y-3">
      {isEditing ? (
        <EditModeActions 
          onSave={onSave} 
          onCancel={onCancel} 
          isSaving={isSaving}
        />
      ) : (
        <ViewModeActions 
          onEdit={onEdit} 
          onLogout={onLogout} 
        />
      )}
    </div>
  );
};

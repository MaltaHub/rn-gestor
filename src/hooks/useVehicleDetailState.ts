
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { useNavigate } from "react-router-dom";

export const useVehicleDetailState = (vehicle: Vehicle, canEdit: boolean) => {
  const navigate = useNavigate();
  const { updateVehicle, deleteVehicle } = useVehicles();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editedVehicle, setEditedVehicle] = useState<Vehicle>({ ...vehicle });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setEditedVehicle(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof Vehicle] as Record<string, unknown>),
          [child]: value
        }
      }));
    } else if (name === 'price' || name === 'mileage' || name === 'year') {
      setEditedVehicle(prev => ({
        ...prev,
        [name]: Number(value)
      }));
    } else {
      setEditedVehicle(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  const handleStatusChange = (value: string) => {
    setEditedVehicle(prev => ({
      ...prev,
      status: value as Vehicle['status']
    }));
  };

  const handleUpdate = async () => {
    if (!canEdit) {
      toast("Você não tem permissão para editar veículos");
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    
    try {
      await updateVehicle(vehicle.id, editedVehicle);
      setIsEditing(false);
    } catch (error) {
      console.error("Erro ao atualizar veículo:", error);
      toast.error("Erro ao atualizar veículo");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteVehicle(vehicle.id);
      navigate('/inventory');
    } catch (error) {
      console.error("Erro ao excluir veículo:", error);
      toast.error("Erro ao excluir veículo");
      setIsDeleting(false);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedVehicle({...vehicle});
  };

  return {
    isEditing,
    isSaving,
    isDeleting,
    editedVehicle,
    handleInputChange,
    handleStatusChange,
    handleUpdate,
    handleDelete,
    handleCancelEdit,
    setIsEditing
  };
};

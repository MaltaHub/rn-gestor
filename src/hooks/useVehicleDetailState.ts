
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { toast } from "@/components/ui/sonner";

export const useVehicleDetailState = (vehicle: Vehicle, canEdit: boolean = true) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editedVehicle, setEditedVehicle] = useState<Vehicle>({...vehicle});
  
  const { updateVehicle, deleteVehicle } = useVehicles();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('specifications.')) {
      const specName = name.split('.')[1];
      setEditedVehicle(prev => ({
        ...prev,
        specifications: {
          ...prev.specifications,
          [specName]: value
        }
      }));
    } else {
      setEditedVehicle(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  const handleStatusChange = (value: string) => {
    // Ensure status is one of the allowed values
    const status = value as "available" | "sold" | "reserved";
    setEditedVehicle(prev => ({
      ...prev,
      status
    }));
  };
  
  const handleUpdate = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      await updateVehicle(vehicle.id, editedVehicle);
      setIsEditing(false);
      toast.success("Veículo atualizado com sucesso");
    } catch (error) {
      console.error("Error updating vehicle:", error);
      toast.error("Erro ao atualizar veículo");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    try {
      await deleteVehicle(vehicle.id);
      toast.success("Veículo excluído com sucesso");
      navigate('/inventory');
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast.error("Erro ao excluir veículo");
      setIsDeleting(false);
    }
  };
  
  const handleCancelEdit = () => {
    setEditedVehicle({...vehicle});
    setIsEditing(false);
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

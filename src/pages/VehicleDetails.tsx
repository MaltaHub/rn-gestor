
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { usePermission } from "@/contexts/PermissionContext";
import { ArrowLeft } from "lucide-react";
import { Info } from "lucide-react";
import { NotFoundCard } from "@/components/vehicle-details/NotFoundCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { VehicleActions } from "@/components/vehicle-details/VehicleActions";
import { VehicleImage } from "@/components/vehicle-details/VehicleImage";
import { VehicleBasicInfo } from "@/components/vehicle-details/VehicleBasicInfo";
import { VehicleSpecifications } from "@/components/vehicle-details/VehicleSpecifications";
import { VehicleDescription } from "@/components/vehicle-details/VehicleDescription";

const VehicleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const { checkPermission } = usePermission();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Check if user has edit permission (level 2 for inventory)
  const canEdit = checkPermission('inventory', 2);
  
  const vehicle = getVehicle(id || "");
  
  if (!vehicle) {
    return <NotFoundCard />;
  }
  
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
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    updateVehicle(vehicle.id, editedVehicle);
    setIsEditing(false);
    setIsSaving(false);
    toast("Veículo atualizado com sucesso!");
  };
  
  const handleDelete = async () => {
    if (!canEdit) {
      toast("Você não tem permissão para excluir veículos");
      return;
    }
    
    deleteVehicle(vehicle.id);
    toast("Veículo excluído com sucesso!");
    navigate('/inventory');
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedVehicle({...vehicle});
  };

  return (
    <div className="content-container py-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Estoque
        </Button>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl">
            {vehicle.model}
          </CardTitle>
          
          <VehicleActions
            vehicle={vehicle}
            isEditing={isEditing}
            isSaving={isSaving}
            canEdit={canEdit}
            onEdit={() => setIsEditing(true)}
            onCancel={handleCancelEdit}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </CardHeader>
        
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <VehicleImage
              vehicle={vehicle}
              editedVehicle={editedVehicle}
              isEditing={isEditing}
              handleInputChange={handleInputChange}
            />
            
            <div className="space-y-6">
              <VehicleBasicInfo 
                vehicle={vehicle}
                editedVehicle={editedVehicle}
                isEditing={isEditing}
                handleInputChange={handleInputChange}
                handleStatusChange={handleStatusChange}
              />
              
              <Separator />
              
              <VehicleSpecifications
                vehicle={vehicle}
                editedVehicle={editedVehicle}
                isEditing={isEditing}
                handleInputChange={handleInputChange}
              />
            </div>
          </div>
          
          <VehicleDescription
            vehicle={vehicle}
            editedVehicle={editedVehicle}
            isEditing={isEditing}
            handleInputChange={handleInputChange}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default VehicleDetailsPage;


import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { usePermission } from "@/contexts/PermissionContext";
import { ArrowLeft, Save, X } from "lucide-react";
import { NotFoundCard } from "@/components/vehicle-details/NotFoundCard";
import { VehicleEditForm } from "@/components/vehicle-edit/VehicleEditForm";

const EditVehiclePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle } = useVehicles();
  const { checkPermission } = usePermission();
  const [isSaving, setIsSaving] = useState(false);
  
  // Check if user has edit permission (level 2 for inventory)
  const canEdit = checkPermission('inventory', 2);
  
  const vehicle = getVehicle(id || "");
  
  const [editedVehicle, setEditedVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (vehicle) {
      setEditedVehicle({ ...vehicle });
    }
  }, [vehicle]);

  if (!vehicle) {
    return <NotFoundCard />;
  }

  if (!canEdit) {
    return (
      <div className="content-container py-6">
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-medium text-gray-600">Acesso Negado</h3>
            <p className="mt-2 text-gray-500">Você não tem permissão para editar veículos.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate(`/vehicle/${id}`)}
            >
              Voltar aos Detalhes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!editedVehicle) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setEditedVehicle(prev => prev ? ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof Vehicle] as Record<string, unknown>),
          [child]: value
        }
      }) : null);
    } else if (name === 'price' || name === 'mileage' || name === 'year') {
      setEditedVehicle(prev => prev ? ({
        ...prev,
        [name]: Number(value)
      }) : null);
    } else {
      setEditedVehicle(prev => prev ? ({
        ...prev,
        [name]: value
      }) : null);
    }
  };
  
  const handleStatusChange = (value: string) => {
    setEditedVehicle(prev => prev ? ({
      ...prev,
      status: value as Vehicle['status']
    }) : null);
  };

  const handleSave = async () => {
    if (!editedVehicle) return;
    
    setIsSaving(true);
    
    try {
      await updateVehicle(vehicle.id, editedVehicle);
      toast.success("Veículo atualizado com sucesso!");
      navigate(`/vehicle/${id}`);
    } catch (error) {
      toast.error("Erro ao atualizar veículo");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    navigate(`/vehicle/${id}`);
  };

  return (
    <div className="content-container py-6">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/vehicle/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar aos Detalhes
        </Button>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Editando: {vehicle.model}
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          <VehicleEditForm
            vehicle={editedVehicle}
            onInputChange={handleInputChange}
            onStatusChange={handleStatusChange}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default EditVehiclePage;

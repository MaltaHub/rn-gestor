import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { useVehicles } from "@/contexts/VehicleContext";
import { VehicleWithIndicators } from "@/types";
import { usePermission } from "@/contexts/PermissionContext";
import { ArrowLeft, Edit, Trash2, X, Save, Car, DollarSign, Calendar, Gauge } from "lucide-react";
import { NotFoundCard } from "@/components/vehicle-details/NotFoundCard";
import { VehicleImage } from "@/components/vehicle-details/VehicleImage";
import { VehicleIndicators } from "@/components/vehicle-indicators/VehicleIndicators";
import { SaleButton } from "@/components/vehicle-details/SaleButton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import VehicleEditForm from "@/components/vehicle-edit/VehicleEditForm";
import { StoreTransferDialog } from "@/components/vehicle-edit/StoreTransferDialog";

const VehicleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle, deleteVehicle, isLoading } = useVehicles();
  const { checkPermission } = usePermission();

  const [isEditing, setIsEditing] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  
  const canEdit = checkPermission("edit_vehicle", 2);
  const canDelete = checkPermission("inventory", 9); // Apenas admins podem deletar

  const vehicle = getVehicle(id || "");

  if (isLoading) {
    return <VehicleDetailsSkeleton />;
  }

  if (!vehicle) {
    return <NotFoundCard />;
  }

  const handleUpdate = async (updatedData: Partial<VehicleWithIndicators>) => {
    if (!canEdit) {
      toast.error("Você não tem permissão para editar veículos.");
      return;
    }
    
    await updateVehicle(vehicle.id, updatedData);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!canDelete) {
      toast.error("Você não tem permissão para excluir veículos.");
      return;
    }

    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este veículo permanentemente? Esta ação não pode ser desfeita."
    );
    if (!confirmed) return;

    await deleteVehicle(vehicle.id);
    navigate("/inventory");
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Disponível</Badge>;
      case "reserved":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Reservado</Badge>;
      case "sold":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Vendido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-6 space-y-6">
        
        {/* Navegação e Título */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Estoque
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Detalhes do Veículo</h1>
            <VehicleIndicators vehicle={vehicle} />
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna da Esquerda (Imagem e Ações) */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
              <CardContent className="p-4">
                <VehicleImage vehicle={vehicle} />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
              <CardHeader>
                <CardTitle className="text-lg">Ações</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col space-y-3">
                <SaleButton vehicle={vehicle} onSale={() => navigate('/inventory')} />
                <Button 
                  variant="outline" 
                  onClick={() => setIsTransferring(true)} 
                  disabled={!canEdit || vehicle.status === 'sold'}
                >
                  Transferir Loja
                </Button>
                {canDelete && (
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir Veículo
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Coluna da Direita (Informações e Edição) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{vehicle.model}</h2>
                  <p className="text-slate-600 dark:text-slate-400">{vehicle.plate}</p>
                </div>
                {canEdit && (
                  <Button variant={isEditing ? "secondary" : "default"} onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? <><X className="mr-2 h-4 w-4"/> Cancelar</> : <><Edit className="mr-2 h-4 w-4"/> Editar</>}
                  </Button>
                )}
              </CardHeader>

              <CardContent>
                {isEditing ? (
                  <VehicleEditForm 
                    vehicle={vehicle}
                    onSave={handleUpdate}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">Preço</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {vehicle.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <Calendar className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">Ano</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{vehicle.year}</p>
                      </div>
                      <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <Gauge className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">KM</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{vehicle.mileage.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <Car className="h-5 w-5 mx-auto text-slate-600 mb-1" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">Status</p>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {getStatusBadge(vehicle.status)}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-200">Descrição</h3>
                      <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{vehicle.description || "Nenhuma descrição fornecida."}</p>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-200">Especificações</h3>
                      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {Object.entries(vehicle.specifications || {}).map(([key, value]) => (
                          <li key={key} className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Modal de Transferência de Loja */}
        <StoreTransferDialog 
          isOpen={isTransferring}
          onClose={() => setIsTransferring(false)}
          vehicleId={vehicle.id}
          currentStore={vehicle.store}
        />
      </div>
    </div>
  );
};

const VehicleDetailsSkeleton: React.FC = () => (
  <div className="container mx-auto px-4 py-6 space-y-6 animate-pulse">
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-36" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div className="lg:col-span-2">
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  </div>
);

export default VehicleDetailsPage;

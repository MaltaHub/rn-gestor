import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Save, Camera } from 'lucide-react';
import VehicleEditForm from "@/components/vehicle-edit/VehicleEditForm";
import { VehicleImageManager } from '@/components/vehicle-gallery/VehicleImageManager';
import { StoreTransferDialog } from '@/components/vehicle-edit/StoreTransferDialog';
import { useVehicles } from '@/contexts/VehicleContext';
import { VehicleWithIndicators } from '@/types';
import { toast } from '@/components/ui/sonner';
import { usePermission } from '@/contexts/PermissionContext';
import { NotFoundCard } from '@/components/vehicle-details/NotFoundCard';
import { Skeleton } from '@/components/ui/skeleton';

const EditVehicle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle, deleteVehicle, isLoading } = useVehicles();
  const { checkPermission } = usePermission();

  const [activeTab, setActiveTab] = useState<'details' | 'gallery'>('details');
  const [isTransferring, setIsTransferring] = useState(false);

  const canEdit = checkPermission("edit_vehicle", 2);
  const canDelete = checkPermission("inventory", 9);

  const vehicle = getVehicle(id || "");

  if (isLoading) {
    return (
      <div className="content-container py-6">
        <Skeleton className="h-12 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!vehicle) {
    return <NotFoundCard />;
  }

  const handleSave = async (updatedData: Partial<VehicleWithIndicators>) => {
    if (!canEdit) {
      toast.error("Você não tem permissão para editar este veículo.");
      return;
    }
    await updateVehicle(vehicle.id, updatedData);
    // Opcional: voltar para a página de detalhes ou inventário após salvar
    navigate(`/vehicle/${vehicle.id}`);
  };

  const handleDelete = async () => {
    if (!canDelete) {
      toast.error("Você não tem permissão para excluir este veículo.");
      return;
    }
    if (window.confirm('Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita.')) {
      await deleteVehicle(vehicle.id);
      navigate('/inventory');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/vehicle/${vehicle.id}`)}
              className="mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar aos Detalhes
            </Button>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Editar Veículo</h1>
            <p className="text-slate-600 dark:text-slate-400">{vehicle.plate} - {vehicle.model}</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline"
              onClick={() => setIsTransferring(true)} 
              disabled={!canEdit || vehicle.status === 'sold'}
            >
              Transferir Loja
            </Button>
            {canDelete && (
              <Button
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('details')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'details'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Detalhes do Veículo
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'gallery'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Galeria de Fotos
            </button>
          </nav>
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === 'details' ? (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader>
              <CardTitle>Informações do Veículo</CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleEditForm
                vehicle={vehicle}
                onSave={handleSave}
                onCancel={() => navigate(`/vehicle/${vehicle.id}`)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Gerenciar Galeria de Fotos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleImageManager vehicleId={vehicle.id} />
            </CardContent>
          </Card>
        )}
        
        {/* Modal de Transferência */}
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

export default EditVehicle;

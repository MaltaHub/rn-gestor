import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Save } from 'lucide-react';
import { VehicleEditForm } from '@/components/vehicle-edit/VehicleEditForm';
import { VehicleImageManager } from '@/components/vehicle-gallery/VehicleImageManager';
import { StoreTransferDialog } from '@/components/vehicle-edit/StoreTransferDialog';
import { useVehicles } from '@/contexts/VehicleContext';
import { useStore } from '@/contexts/StoreContext';
import { Vehicle } from '@/types';
import { StoreType } from '@/types/store';
import { toast } from '@/components/ui/sonner';

const EditVehicle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vehicles, updateVehicle, deleteVehicle } = useVehicles();
  const { currentStore, setCurrentStore } = useStore();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [editedVehicle, setEditedVehicle] = useState<Vehicle | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'gallery'>('details');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id && vehicles.length > 0) {
      const foundVehicle = vehicles.find(v => v.id === id);
      if (foundVehicle) {
        setVehicle(foundVehicle);
        setEditedVehicle({ ...foundVehicle });
        // Se o veículo pertence a uma loja diferente, muda automaticamente
        if (foundVehicle.store !== currentStore) {
          setCurrentStore(foundVehicle.store);
        }
      } else {
        toast.error('Veículo não encontrado');
        navigate('/inventory');
      }
    }
  }, [id, vehicles, currentStore, setCurrentStore, navigate]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!editedVehicle) return;

    const { name, type, value, checked } = e.target as HTMLInputElement;
    // decide o valor certo
    const fieldValue =
      type === 'checkbox'
        ? checked
        : name === 'year' || name === 'mileage' || name === 'price'
          ? Number(value)
          : value;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setEditedVehicle(prev => {
        if (!prev) return null;
        const parentValue = prev[parent as keyof Vehicle] as any;
        const updatedParent =
          typeof parentValue === 'object' && parentValue !== null
            ? { ...parentValue, [child]: fieldValue }
            : { [child]: fieldValue };
        return { ...prev, [parent]: updatedParent };
      });
    } else {
      setEditedVehicle(prev =>
        prev
          ? {
            ...prev,
            [name]: fieldValue,
          }
          : null
      );
    }
  };

  const handleStatusChange = (value: string) => {
    if (!editedVehicle) return;

    setEditedVehicle(prev => prev ? {
      ...prev,
      status: value as Vehicle['status']
    } : null);
  };

  const handleSave = async () => {
    if (!vehicle || !editedVehicle) return;

    setIsSaving(true);
    try {
      await updateVehicle(vehicle.id, editedVehicle);
      toast.success('Veículo atualizado com sucesso!');

      // Atualiza o estado local
      setVehicle(editedVehicle);
    } catch (error) {
      toast.error('Erro ao atualizar veículo');
      console.error('Erro:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!vehicle) return;

    if (window.confirm('Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita.')) {
      try {
        await deleteVehicle(vehicle.id);
        toast.success('Veículo excluído com sucesso!');
        navigate('/inventory');
      } catch (error) {
        toast.error('Erro ao excluir veículo');
        console.error('Erro:', error);
      }
    }
  };

  const handleStoreTransfer = async (newStore: StoreType) => {
    if (!vehicle || !editedVehicle) return;

    try {
      const updatedVehicle = { ...editedVehicle, store: newStore };
      await updateVehicle(vehicle.id, updatedVehicle);
      setVehicle(updatedVehicle);
      setEditedVehicle(updatedVehicle);
      setCurrentStore(newStore);
      toast.success('Veículo transferido com sucesso!');
    } catch (error) {
      toast.error('Erro ao transferir veículo');
      throw error;
    }
  };

  if (!vehicle || !editedVehicle) {
    return (
      <div className="content-container py-6">
        <div className="text-center">
          <p>Carregando veículo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/inventory')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Editar Veículo</h1>
            <p className="text-gray-600">{vehicle.plate} - {vehicle.model}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
          </Button>
          <StoreTransferDialog
            vehicle={vehicle}
            onTransfer={handleStoreTransfer}
          />
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir</span>
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex space-x-4 border-b">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'details'
                ? 'border-vehicleApp-red text-vehicleApp-red'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Detalhes do Veículo
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'gallery'
                ? 'border-vehicleApp-red text-vehicleApp-red'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            Galeria de Fotos
          </button>
        </div>
      </div>

      {activeTab === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Informações do Veículo</span>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Loja:</span>
                <span className="font-medium">{vehicle.store}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VehicleEditForm
              vehicle={editedVehicle}
              onInputChange={handleInputChange}
              onStatusChange={handleStatusChange}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="local" className="block text-sm font-medium text-gray-700">Local</label>
                <input
                  type="text"
                  id="local"
                  name="local"
                  value={editedVehicle?.local || ''}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="documentacao" className="block text-sm font-medium text-gray-700">Documentação</label>
                <input
                  type="text"
                  id="documentacao"
                  name="documentacao"
                  value={editedVehicle?.documentacao || ''}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="fotos_roberto" className="block text-sm font-medium text-gray-700">Fotos Roberto</label>
                <input
                  type="checkbox"
                  name="fotos_roberto"
                  checked={editedVehicle.fotos_roberto || false}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="fotos_rn" className="block text-sm font-medium text-gray-700">Fotos RN</label>
                <input
                  type="checkbox"
                  name="fotos_rn"
                  checked={editedVehicle.fotos_rn || false}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'gallery' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Galeria de Fotos</span>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Loja:</span>
                <span className="font-medium">{vehicle.store}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VehicleImageManager vehicleId={vehicle.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EditVehicle;

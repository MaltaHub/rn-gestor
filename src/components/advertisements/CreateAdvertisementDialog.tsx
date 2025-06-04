
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { PlatformType } from '@/types/store';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { useVehicles } from '@/contexts/VehicleContext';
import { useStore } from '@/contexts/StoreContext';

interface CreateAdvertisementForm {
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  advertised_price: number;
  description?: string;
}

export const CreateAdvertisementDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);
  const { createAdvertisement } = useAdvertisements();
  const { vehicles } = useVehicles();
  const { currentStore } = useStore();
  
  const { register, handleSubmit, reset, setValue, watch } = useForm<CreateAdvertisementForm>();

  const platforms: PlatformType[] = [
    'OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit'
  ];

  const availableVehicles = vehicles.filter(v => v.status === 'available');

  const onSubmit = (data: CreateAdvertisementForm) => {
    const advertisementData = {
      ...data,
      vehicle_plates: selectedPlates,
      created_date: new Date().toISOString(),
      id_origem: null,
      store: currentStore
    };

    createAdvertisement(advertisementData);
    reset();
    setSelectedPlates([]);
    setOpen(false);
  };

  const togglePlateSelection = (plate: string) => {
    setSelectedPlates(prev => 
      prev.includes(plate) 
        ? prev.filter(p => p !== plate)
        : [...prev, plate]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-vehicleApp-red hover:bg-red-600">
          <Plus className="w-4 h-4 mr-2" />
          Novo Anúncio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Novo Anúncio</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="id_ancora">ID Âncora</Label>
              <Input
                id="id_ancora"
                {...register('id_ancora', { required: true })}
                placeholder="Ex: ANC-001"
              />
            </div>
            
            <div>
              <Label htmlFor="platform">Plataforma</Label>
              <Select onValueChange={(value: PlatformType) => setValue('platform', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map(platform => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="advertised_price">Preço Anunciado</Label>
            <Input
              id="advertised_price"
              type="number"
              step="0.01"
              {...register('advertised_price', { required: true, valueAsNumber: true })}
              placeholder="R$ 0,00"
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição do Anúncio</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Digite uma descrição para o anúncio..."
              rows={3}
            />
          </div>

          <div>
            <Label>Veículos do Anúncio</Label>
            <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
              {availableVehicles.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum veículo disponível</p>
              ) : (
                availableVehicles.map(vehicle => (
                  <div key={vehicle.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={vehicle.plate}
                      checked={selectedPlates.includes(vehicle.plate)}
                      onChange={() => togglePlateSelection(vehicle.plate)}
                      className="rounded"
                    />
                    <label 
                      htmlFor={vehicle.plate}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {vehicle.plate} - {vehicle.model} ({vehicle.color})
                    </label>
                  </div>
                ))
              )}
            </div>
            {selectedPlates.length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {selectedPlates.length} veículo(s) selecionado(s)
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={selectedPlates.length === 0}
              className="bg-vehicleApp-red hover:bg-red-600"
            >
              Criar Anúncio
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

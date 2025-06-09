
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { PlatformType } from '@/types/store';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { useVehicles } from '@/contexts/VehicleContext';
import { useStore } from '@/contexts/StoreContext';
import { useSmartValidation } from '@/hooks/useSmartValidation';
import { Database } from '@/integrations/supabase/types';

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
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | ''>('');
  const { createAdvertisement } = useAdvertisements();
  const { vehicles } = useVehicles();
  const { currentStore } = useStore();
  const { 
    getAvailablePlatesForPlatform,
    getMissingPlatformsForPlate,
    validateAdvertisementCreation 
  } = useSmartValidation();
  
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateAdvertisementForm>();

  const platforms: Database['public']['Enums']['platform_type'][] = [
    'OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit', 'Instagram'
  ];

  // Filtrar veículos disponíveis baseado na plataforma selecionada
  const availableVehicles = selectedPlatform 
    ? vehicles.filter(v => 
        v.status === 'available' && 
        getAvailablePlatesForPlatform(selectedPlatform).includes(v.plate)
      )
    : vehicles.filter(v => v.status === 'available');

  // Validação em tempo real
  const validation = selectedPlatform 
    ? validateAdvertisementCreation(selectedPlates, selectedPlatform)
    : { isValid: true, errors: [], warnings: [] };

  const onSubmit = (data: CreateAdvertisementForm) => {
    if (!validation.isValid) {
      return;
    }

    const advertisementData = {
      ...data,
      vehicle_plates: selectedPlates,
      platform: selectedPlatform as PlatformType,
      created_date: new Date().toISOString(),
      id_origem: null,
      store: currentStore
    };

    createAdvertisement(advertisementData);
    reset();
    setSelectedPlates([]);
    setSelectedPlatform('');
    setOpen(false);
  };

  const togglePlateSelection = (plate: string) => {
    setSelectedPlates(prev => 
      prev.includes(plate) 
        ? prev.filter(p => p !== plate)
        : [...prev, plate]
    );
  };

  const handlePlatformChange = (platform: PlatformType) => {
    setSelectedPlatform(platform);
    setValue('platform', platform);
    // Limpar seleções que não são válidas para esta plataforma
    const validPlates = getAvailablePlatesForPlatform(platform);
    setSelectedPlates(prev => prev.filter(plate => validPlates.includes(plate)));
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setSelectedPlates([]);
      setSelectedPlatform('');
    }
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-vehicleApp-red hover:bg-red-600">
          <Plus className="w-4 h-4 mr-2" />
          Novo Anúncio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="platform">Plataforma*</Label>
              <Select value={selectedPlatform} onValueChange={handlePlatformChange}>
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

          {/* Validação em tempo real */}
          {validation.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {validation.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validation.warnings.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {validation.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label>
              Veículos do Anúncio 
              {selectedPlatform && (
                <span className="text-sm text-muted-foreground ml-2">
                  (Apenas veículos disponíveis para {selectedPlatform})
                </span>
              )}
            </Label>
            <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
              {availableVehicles.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  {selectedPlatform 
                    ? `Nenhum veículo disponível para ${selectedPlatform}`
                    : 'Selecione uma plataforma primeiro'
                  }
                </p>
              ) : (
                availableVehicles.map(vehicle => {
                  const missingPlatforms = getMissingPlatformsForPlate(vehicle.plate);
                  return (
                    <div key={vehicle.id} className="space-y-1">
                      <div className="flex items-center space-x-2">
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
                      {missingPlatforms.length > 0 && (
                        <div className="ml-6 flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">Faltam:</span>
                          {missingPlatforms.map(platform => (
                            <Badge key={platform} variant="outline" className="text-xs">
                              {platform}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {selectedPlates.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <p className="text-sm text-green-600">
                  {selectedPlates.length} veículo(s) selecionado(s)
                </p>
              </div>
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
              disabled={!validation.isValid || selectedPlates.length === 0}
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

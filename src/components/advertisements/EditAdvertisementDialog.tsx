
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlatformType } from '@/types';
import { toast } from '@/components/ui/sonner';
import { useSmartValidation } from '@/hooks/useSmartValidation';
import { useVehiclesData } from '@/hooks/useVehiclesData';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface Advertisement {
  id: string;
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  advertised_price?: number;
  description?: string;
  all_vehicle_plates?: string[];
}

interface EditAdvertisementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advertisement: Advertisement | null;
  onSave: (updated: Advertisement) => Promise<void>;
}

export const EditAdvertisementDialog = ({
  open,
  onOpenChange,
  advertisement,
  onSave,
}: EditAdvertisementDialogProps): JSX.Element => {
  const [idAncora, setIdAncora] = useState(advertisement?.id_ancora || '');
  const [platform, setPlatform] = useState<PlatformType>(advertisement?.platform || 'OLX');
  const [advertisedPrice, setAdvertisedPrice] = useState(advertisement?.advertised_price?.toString() || '');
  const [description, setDescription] = useState(advertisement?.description || '');
  const [selectedPlates, setSelectedPlates] = useState<string[]>(advertisement?.vehicle_plates || []);
  const [isSaving, setIsSaving] = useState(false);

  const { vehicles } = useVehiclesData();
  const {
    isPlateAvailableForPlatform,
    getAvailablePlatformsForPlate,
    getMissingPlatformsForPlate,
    validateAdvertisementCreation
  } = useSmartValidation();

  // Veículos disponíveis (apenas os que estão disponíveis para venda)
  const availableVehicles = useMemo(() => {
    return vehicles.filter(v => v.status === 'available');
  }, [vehicles]);

  // Placas que podem ser selecionadas para a plataforma atual
  const selectablePlates = useMemo(() => {
    return availableVehicles
      .map(v => v.plate)
      .filter(plate => {
        // Permite a placa se:
        // 1. Já está selecionada no anúncio atual OU
        // 2. Está disponível para a plataforma atual
        return selectedPlates.includes(plate) || 
               isPlateAvailableForPlatform(plate, platform);
      });
  }, [availableVehicles, platform, selectedPlates, isPlateAvailableForPlatform]);

  // Plataformas disponíveis para mudança
  const availablePlatforms = useMemo(() => {
    if (selectedPlates.length === 0) return [];
    
    // Encontrar plataformas disponíveis para TODAS as placas selecionadas
    const allPlatforms: PlatformType[] = ['OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit', 'Instagram'];
    
    return allPlatforms.filter(plat => {
      if (plat === advertisement?.platform) return true; // Sempre permite a plataforma atual
      
      return selectedPlates.every(plate => 
        isPlateAvailableForPlatform(plate, plat)
      );
    });
  }, [selectedPlates, advertisement?.platform, isPlateAvailableForPlatform]);

  // Validação em tempo real
  const validation = useMemo(() => {
    if (selectedPlates.length === 0) {
      return {
        isValid: false,
        errors: ['Selecione pelo menos um veículo'],
        warnings: []
      };
    }

    return validateAdvertisementCreation(selectedPlates, platform);
  }, [selectedPlates, platform, validateAdvertisementCreation]);

  // Insights e sugestões
  const insights = useMemo(() => {
    const suggestions = [];
    
    selectedPlates.forEach(plate => {
      const missingPlatforms = getMissingPlatformsForPlate(plate);
      if (missingPlatforms.length > 0) {
        suggestions.push({
          type: 'info',
          message: `${plate}: Faltam anúncios em ${missingPlatforms.join(', ')}`
        });
      }
    });

    return suggestions;
  }, [selectedPlates, getMissingPlatformsForPlate]);

  useEffect(() => {
    if (advertisement) {
      setIdAncora(advertisement.id_ancora);
      setPlatform(advertisement.platform);
      setAdvertisedPrice(advertisement.advertised_price?.toString() || '');
      setDescription(advertisement.description || '');
      setSelectedPlates(advertisement.vehicle_plates || []);
    }
  }, [advertisement]);

  const handlePlateToggle = (plate: string) => {
    setSelectedPlates((prev) => {
      const newSelection = prev.includes(plate) 
        ? prev.filter((p) => p !== plate) 
        : [...prev, plate];
      
      // Não permitir remoção da última placa
      if (newSelection.length === 0) {
        toast.error('O anúncio deve ter pelo menos um veículo');
        return prev;
      }
      
      return newSelection;
    });
  };

  const handlePlatformChange = (value: string) => {
    const newPlatform = value as PlatformType;
    
    // Verificar se todas as placas selecionadas são válidas para a nova plataforma
    const invalidPlates = selectedPlates.filter(plate => 
      !isPlateAvailableForPlatform(plate, newPlatform) && 
      newPlatform !== advertisement?.platform
    );
    
    if (invalidPlates.length > 0) {
      toast.error(`As placas ${invalidPlates.join(', ')} já estão anunciadas na ${newPlatform}`);
      return;
    }
    
    setPlatform(newPlatform);
  };

  const handleSave = async () => {
    if (!validation.isValid) {
      toast.error('Corrija os erros antes de salvar');
      return;
    }

    if (selectedPlates.length === 0) {
      toast.error('O anúncio deve ter pelo menos um veículo');
      return;
    }

    setIsSaving(true);
    try {
      const updated = {
        ...advertisement!,
        id_ancora: idAncora,
        platform,
        advertised_price: Number(advertisedPrice),
        description,
        vehicle_plates: selectedPlates,
      };
      await onSave(updated);
      toast.success('Anúncio atualizado com sucesso!');
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao atualizar anúncio');
    } finally {
      setIsSaving(false);
    }
  };

  const getVehicleInfo = (plate: string) => {
    const vehicle = availableVehicles.find(v => v.plate === plate);
    return vehicle ? `${vehicle.model} (${vehicle.year})` : plate;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Anúncio</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Validação e Alertas */}
          {!validation.isValid && (
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
            <label className="block text-sm font-medium mb-1">ID Âncora</label>
            <Input 
              value={idAncora} 
              onChange={e => setIdAncora(e.target.value)}
              placeholder="ID único do anúncio na plataforma"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Plataforma
              <span className="text-sm text-muted-foreground ml-2">
                ({availablePlatforms.length} disponíveis)
              </span>
            </label>
            <Select value={platform} onValueChange={handlePlatformChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePlatforms.map(plat => (
                  <SelectItem key={plat} value={plat}>
                    {plat}
                    {plat === advertisement?.platform && (
                      <Badge variant="outline" className="ml-2">Atual</Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Preço Anunciado</label>
            <Input 
              type="number" 
              value={advertisedPrice} 
              onChange={e => setAdvertisedPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <Input 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              placeholder="Descrição do anúncio"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Veículos do Anúncio
              <span className="text-sm text-muted-foreground ml-2">
                ({selectedPlates.length} selecionados, {selectablePlates.length} disponíveis)
              </span>
            </label>
            
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded p-3">
              {selectablePlates.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  Nenhum veículo disponível para esta plataforma
                </div>
              ) : (
                selectablePlates.map((plate: string) => {
                  const isSelected = selectedPlates.includes(plate);
                  const isCurrentlyUsed = advertisement?.vehicle_plates.includes(plate);
                  
                  return (
                    <label 
                      key={plate} 
                      className={`flex items-center gap-3 p-2 border rounded cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handlePlateToggle(plate)}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <div className="font-mono font-medium">{plate}</div>
                        <div className="text-sm text-muted-foreground">
                          {getVehicleInfo(plate)}
                        </div>
                      </div>
                      {isCurrentlyUsed && (
                        <Badge variant="outline">Atual</Badge>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Insights e Sugestões */}
          {insights.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">Oportunidades</label>
              {insights.map((insight, index) => (
                <Alert key={index}>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{insight.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !validation.isValid || selectedPlates.length === 0}
            className="bg-vehicleApp-red hover:bg-red-600"
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformType } from '@/types/store';
import { toast } from '@/components/ui/sonner';

interface Advertisement {
  id: string;
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  advertised_price?: number;
  description?: string;
  all_vehicle_plates?: string[];
  // ...outros campos relevantes
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
  // Usa as placas do anúncio, se houver, senão array vazio
  const allPlates: string[] = Array.isArray(advertisement?.all_vehicle_plates)
    ? advertisement!.all_vehicle_plates
    : Array.isArray(advertisement?.vehicle_plates)
      ? advertisement!.vehicle_plates
      : [];
  const [selectedPlates, setSelectedPlates] = useState<string[]>(advertisement?.vehicle_plates || []);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (advertisement) {
      setIdAncora(advertisement.id_ancora);
      setPlatform(advertisement.platform);
      setAdvertisedPrice(advertisement.advertised_price?.toString() || '');
      setDescription(advertisement.description || '');
      setSelectedPlates(advertisement.vehicle_plates || []);
    }
  }, [advertisement]);

  const handlePlateToggle = (plate: string) => {
    setSelectedPlates((prev) =>
      prev.includes(plate) ? prev.filter((p) => p !== plate) : [...prev, plate]
    );
  };

  const handleSave = async () => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Anúncio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">ID Âncora</label>
            <Input value={idAncora} onChange={e => setIdAncora(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plataforma</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OLX">OLX</SelectItem>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="Mercado Livre">Mercado Livre</SelectItem>
                <SelectItem value="Mobi Auto">Mobi Auto</SelectItem>
                <SelectItem value="ICarros">ICarros</SelectItem>
                <SelectItem value="Na Pista">Na Pista</SelectItem>
                <SelectItem value="Cockpit">Cockpit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preço Anunciado</label>
            <Input type="number" value={advertisedPrice} onChange={e => setAdvertisedPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Placas dos veículos</label>
            <div className="flex flex-wrap gap-2">
              {allPlates.map((plate: string) => (
                <label key={plate} className="flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlates.includes(plate)}
                    onChange={() => handlePlateToggle(plate)}
                  />
                  {plate}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSaving} className="bg-vehicleApp-red hover:bg-red-600 w-full">
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

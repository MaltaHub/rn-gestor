import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVehicles } from '@/contexts/VehicleContext';
import { StoreType } from '@/types';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

interface StoreTransferDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  currentStore: StoreType;
}

const STORES: StoreType[] = ['Roberto Automóveis', 'RN Multimarcas'];

export const StoreTransferDialog: React.FC<StoreTransferDialogProps> = ({
  isOpen,
  onClose,
  vehicleId,
  currentStore,
}) => {
  const { updateVehicle } = useVehicles();
  const [targetStore, setTargetStore] = useState<StoreType | ''>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!targetStore || targetStore === currentStore) {
      toast.warning('Por favor, selecione uma loja diferente da atual.');
      return;
    }

    setIsTransferring(true);
    try {
      await updateVehicle(vehicleId, { store: targetStore });
      toast.success(`Veículo transferido para ${targetStore} com sucesso!`);
      onClose();
    } catch (error) {
      toast.error('Ocorreu um erro ao transferir o veículo.');
      console.error('Store transfer error:', error);
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir Veículo de Loja</DialogTitle>
          <DialogDescription>
            Selecione a nova loja para este veículo. A transferência atualizará a visibilidade do veículo no inventário.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Loja Atual</p>
            <p className="font-semibold">{currentStore}</p>
          </div>
          <div>
            <label htmlFor="target-store" className="text-sm font-medium">
              Nova Loja
            </label>
            <Select value={targetStore} onValueChange={(value) => setTargetStore(value as StoreType)}>
              <SelectTrigger id="target-store" className="mt-1">
                <SelectValue placeholder="Selecione a loja de destino" />
              </SelectTrigger>
              <SelectContent>
                {STORES.filter(store => store !== currentStore).map(store => (
                  <SelectItem key={store} value={store}>
                    {store}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isTransferring}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={!targetStore || isTransferring}>
            {isTransferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';
import { StoreType } from '@/types/store';
import { Vehicle } from '@/types';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/components/ui/sonner';

interface StoreTransferDialogProps {
  vehicle: Vehicle;
  onTransfer: (newStore: StoreType) => Promise<void>;
}

export const StoreTransferDialog: React.FC<StoreTransferDialogProps> = ({
  vehicle,
  onTransfer
}) => {
  const [open, setOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { currentStore } = useStore();

  const stores: StoreType[] = ['Roberto Automóveis', 'RN Multimarcas'];
  const availableStores = stores.filter(store => store !== vehicle.store);

  const handleTransfer = async () => {
    if (!selectedStore) return;

    setIsLoading(true);
    try {
      await onTransfer(selectedStore);
      toast.success(`Veículo transferido para ${selectedStore}`);
      setOpen(false);
      setSelectedStore(null);
    } catch (error) {
      toast.error('Erro ao transferir veículo');
      console.error('Erro na transferência:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Trocar Loja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Veículo</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Veículo: <strong>{vehicle.plate} - {vehicle.model}</strong>
            </p>
            <p className="text-sm text-gray-600">
              Loja atual: <strong>{vehicle.store}</strong>
            </p>
          </div>

          <div>
            <Label htmlFor="new-store">Nova Loja</Label>
            <Select value={selectedStore || ''} onValueChange={(value: StoreType) => setSelectedStore(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a nova loja" />
              </SelectTrigger>
              <SelectContent>
                {availableStores.map(store => (
                  <SelectItem key={store} value={store}>
                    {store}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              <strong>Atenção:</strong> As fotos do veículo serão mantidas, mas serão organizadas 
              de acordo com a nova loja. Você pode adicionar novas fotos específicas para a nova loja.
            </p>
          </div>

          <div className="flex justify-end space-x-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleTransfer}
              disabled={!selectedStore || isLoading}
              className="bg-vehicleApp-red hover:bg-red-600"
            >
              {isLoading ? 'Transferindo...' : 'Transferir'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

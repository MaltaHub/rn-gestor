
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Vehicle, Vendido } from '@/types';

interface SaleFormProps {
  vehicle: Vehicle;
  isOpen: boolean;
  onClose: () => void;
  onSale: (saleData: Omit<Vendido, 'id' | 'created_at'>) => Promise<void>;
}

export const SaleForm: React.FC<SaleFormProps> = ({
  vehicle,
  isOpen,
  onClose,
  onSale
}) => {
  const [formData, setFormData] = useState({
    cpf_cliente: '',
    forma_pagamento: '',
    seguro: false,
    entrada: 0,
    parcelas: 0,
    carro_troca: '',
    abatimento: 0,
    valor_venda: vehicle.price
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, seguro: checked }));
  };

  const requiresApproval = formData.valor_venda < vehicle.price;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.cpf_cliente.trim() || !formData.forma_pagamento.trim()) {
      toast.error('CPF e forma de pagamento são obrigatórios');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const saleData: Omit<Vendido, 'id' | 'created_at'> = {
        vehicle_id: vehicle.id,
        store: vehicle.store,
        data_venda: new Date().toISOString(),
        aprovacao_reducao: requiresApproval,
        ...formData
      };

      await onSale(saleData);
      
      if (requiresApproval) {
        toast.success('Venda registrada! Aguardando aprovação da redução de preço.');
      } else {
        toast.success('Venda registrada com sucesso!');
      }
      
      onClose();
    } catch (error) {
      toast.error('Erro ao registrar venda');
      console.error('Erro:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Venda - {vehicle.plate}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cpf_cliente">CPF do Cliente *</Label>
              <Input
                id="cpf_cliente"
                name="cpf_cliente"
                value={formData.cpf_cliente}
                onChange={handleInputChange}
                placeholder="000.000.000-00"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="forma_pagamento">Forma de Pagamento *</Label>
              <Input
                id="forma_pagamento"
                name="forma_pagamento"
                value={formData.forma_pagamento}
                onChange={handleInputChange}
                placeholder="PIX, Financiamento, Cartão..."
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="valor_venda">Valor de Venda</Label>
              <Input
                id="valor_venda"
                name="valor_venda"
                type="number"
                value={formData.valor_venda}
                onChange={handleInputChange}
                min="0"
                step="0.01"
              />
              {requiresApproval && (
                <p className="text-sm text-amber-600 mt-1">
                  ⚠️ Redução de preço requer aprovação
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="entrada">Entrada</Label>
              <Input
                id="entrada"
                name="entrada"
                type="number"
                value={formData.entrada}
                onChange={handleInputChange}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="parcelas">Número de Parcelas</Label>
              <Input
                id="parcelas"
                name="parcelas"
                type="number"
                value={formData.parcelas}
                onChange={handleInputChange}
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="abatimento">Abatimento</Label>
              <Input
                id="abatimento"
                name="abatimento"
                type="number"
                value={formData.abatimento}
                onChange={handleInputChange}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="carro_troca">Carro de Troca</Label>
            <Textarea
              id="carro_troca"
              name="carro_troca"
              value={formData.carro_troca}
              onChange={handleInputChange}
              placeholder="Descrição do veículo de troca (se houver)"
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="seguro"
              checked={formData.seguro}
              onCheckedChange={handleCheckboxChange}
            />
            <Label htmlFor="seguro">Cliente contratou seguro</Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar Venda'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

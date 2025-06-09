
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { Vehicle, Vendido } from '@/types';
import { Calculator, AlertTriangle } from 'lucide-react';

interface SaleFormValidatedProps {
  vehicle: Vehicle;
  isOpen: boolean;
  onClose: () => void;
  onSale: (saleData: Omit<Vendido, 'id' | 'created_at'>) => Promise<void>;
}

export const SaleFormValidated: React.FC<SaleFormValidatedProps> = ({
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validação de CPF
  const validateCPF = (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11) return false;
    
    // Verificar se não são todos os dígitos iguais
    if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
    
    // Algoritmo de validação do CPF
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
    
    return true;
  };

  // Formatação de CPF
  const formatCPF = (value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    if (cleanValue.length <= 11) {
      return cleanValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cleanValue.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  // Validações do formulário
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // CPF obrigatório e válido
    if (!formData.cpf_cliente.trim()) {
      newErrors.cpf_cliente = 'CPF é obrigatório';
    } else if (!validateCPF(formData.cpf_cliente)) {
      newErrors.cpf_cliente = 'CPF inválido';
    }

    // Forma de pagamento obrigatória
    if (!formData.forma_pagamento.trim()) {
      newErrors.forma_pagamento = 'Forma de pagamento é obrigatória';
    }

    // Valor de venda deve estar entre R$ 5.000 e R$ 500.000
    if (formData.valor_venda < 5000) {
      newErrors.valor_venda = 'Valor mínimo de venda é R$ 5.000';
    } else if (formData.valor_venda > 500000) {
      newErrors.valor_venda = 'Valor máximo de venda é R$ 500.000';
    }

    // Parcelas máximas 60x e valor mínimo por parcela
    if (formData.parcelas > 60) {
      newErrors.parcelas = 'Máximo 60 parcelas';
    }

    if (formData.parcelas > 0) {
      const valorParcela = (formData.valor_venda - formData.entrada) / formData.parcelas;
      if (valorParcela < 200) {
        newErrors.parcelas = 'Valor mínimo por parcela: R$ 200';
      }
    }

    // Entrada não pode ser maior que o valor total
    if (formData.entrada > formData.valor_venda) {
      newErrors.entrada = 'Entrada não pode ser maior que o valor total';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    let processedValue: string | number = value;
    
    if (name === 'cpf_cliente') {
      processedValue = formatCPF(value);
    } else if (type === 'number') {
      processedValue = Number(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    // Limpar erro quando usuário começar a digitar
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, seguro: checked }));
  };

  // Cálculos em tempo real
  const descontoPercentual = ((vehicle.price - formData.valor_venda) / vehicle.price) * 100;
  const requiresApproval = descontoPercentual > 20;
  const valorParcela = formData.parcelas > 0 ? (formData.valor_venda - formData.entrada) / formData.parcelas : 0;
  const valorFinanciado = formData.valor_venda - formData.entrada;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Registrar Venda - {vehicle.plate}
            {requiresApproval && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Requer Aprovação
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações do Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cpf_cliente">CPF do Cliente *</Label>
              <Input
                id="cpf_cliente"
                name="cpf_cliente"
                value={formData.cpf_cliente}
                onChange={handleInputChange}
                placeholder="000.000.000-00"
                className={errors.cpf_cliente ? 'border-red-500' : ''}
                maxLength={14}
                required
              />
              {errors.cpf_cliente && (
                <p className="text-sm text-red-500 mt-1">{errors.cpf_cliente}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="forma_pagamento">Forma de Pagamento *</Label>
              <Input
                id="forma_pagamento"
                name="forma_pagamento"
                value={formData.forma_pagamento}
                onChange={handleInputChange}
                placeholder="PIX, Financiamento, Cartão..."
                className={errors.forma_pagamento ? 'border-red-500' : ''}
                required
              />
              {errors.forma_pagamento && (
                <p className="text-sm text-red-500 mt-1">{errors.forma_pagamento}</p>
              )}
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="valor_venda">Valor de Venda *</Label>
              <Input
                id="valor_venda"
                name="valor_venda"
                type="number"
                value={formData.valor_venda}
                onChange={handleInputChange}
                min="5000"
                max="500000"
                step="0.01"
                className={errors.valor_venda ? 'border-red-500' : ''}
              />
              {errors.valor_venda && (
                <p className="text-sm text-red-500 mt-1">{errors.valor_venda}</p>
              )}
              {descontoPercentual > 0 && (
                <p className={`text-sm mt-1 ${requiresApproval ? 'text-red-600' : 'text-amber-600'}`}>
                  Desconto: {descontoPercentual.toFixed(1)}%
                  {requiresApproval && ' - Requer aprovação do gerente'}
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
                max={formData.valor_venda}
                step="0.01"
                className={errors.entrada ? 'border-red-500' : ''}
              />
              {errors.entrada && (
                <p className="text-sm text-red-500 mt-1">{errors.entrada}</p>
              )}
            </div>

            <div>
              <Label htmlFor="parcelas">Número de Parcelas</Label>
              <Input
                id="parcelas"
                name="parcelas"
                type="number"
                value={formData.parcelas}
                onChange={handleInputChange}
                min="0"
                max="60"
                className={errors.parcelas ? 'border-red-500' : ''}
              />
              {errors.parcelas && (
                <p className="text-sm text-red-500 mt-1">{errors.parcelas}</p>
              )}
            </div>
          </div>

          {/* Calculadora de Parcelas */}
          {formData.parcelas > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <h4 className="font-medium text-blue-800">Resumo do Financiamento</h4>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Valor Financiado:</span>
                  <p className="font-bold text-blue-800">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorFinanciado)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Valor da Parcela:</span>
                  <p className={`font-bold ${valorParcela < 200 ? 'text-red-600' : 'text-blue-800'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Total do Financiamento:</span>
                  <p className="font-bold text-blue-800">
                    {formData.parcelas}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Outros campos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="seguro"
                checked={formData.seguro}
                onCheckedChange={handleCheckboxChange}
              />
              <Label htmlFor="seguro">Cliente contratou seguro</Label>
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

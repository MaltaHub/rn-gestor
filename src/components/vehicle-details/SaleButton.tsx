
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { SaleForm } from '@/components/sale/SaleForm';
import { useSales } from '@/hooks/useSales';
import { Vehicle } from '@/types';

interface SaleButtonProps {
  vehicle: Vehicle;
  onSale?: () => void;
}

export const SaleButton: React.FC<SaleButtonProps> = ({ vehicle, onSale }) => {
  const [showSaleForm, setShowSaleForm] = useState(false);
  
  // Early return BEFORE any hooks are called
  if (vehicle.status !== 'available') {
    return null;
  }
  
  // Now it's safe to call hooks
  const { createSale } = useSales();

  const handleSale = async (saleData: any) => {
    await createSale(saleData);
    setShowSaleForm(false);
    onSale?.();
  };

  return (
    <>
      <Button
        onClick={() => setShowSaleForm(true)}
        className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
      >
        <ShoppingCart className="w-4 h-4" />
        <span>Registrar Venda</span>
      </Button>

      <SaleForm
        vehicle={vehicle}
        isOpen={showSaleForm}
        onClose={() => setShowSaleForm(false)}
        onSale={handleSale}
      />
    </>
  );
};


import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { SaleFormValidated } from '@/components/sale/SaleFormValidated';
import { useSales } from '@/hooks/useSales';
import { Vehicle } from '@/types';

interface SaleButtonProps {
  vehicle: Vehicle;
  onSale?: () => void;
}

export const SaleButton: React.FC<SaleButtonProps> = ({ vehicle, onSale }) => {
  const [showSaleForm, setShowSaleForm] = useState(false);

  const { createSale } = useSales();

  const handleSale = async (saleData: any) => {
    await createSale(saleData);
    setShowSaleForm(false);
    onSale?.();
  };

  return (
    vehicle.status === 'available' ? (
      <>
        <Button
          onClick={() => setShowSaleForm(true)}
          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Registrar Venda</span>
        </Button>

        <SaleFormValidated
          vehicle={vehicle}
          isOpen={showSaleForm}
          onClose={() => setShowSaleForm(false)}
          onSale={handleSale}
        />
      </>
    ) : null
  );
};

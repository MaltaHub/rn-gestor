
import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Store, RefreshCw } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { StoreType } from '@/types/store';

interface StoreSwitcherProps {
  showLabel?: boolean;
  variant?: 'select' | 'button';
}

export const StoreSwitcher: React.FC<StoreSwitcherProps> = ({ 
  showLabel = true, 
  variant = 'select' 
}) => {
  const { currentStore, setCurrentStore, switchStore } = useStore();

  const getStoreBadgeColor = (store: StoreType) => {
    return store === 'Roberto Automóveis' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-purple-100 text-purple-800';
  };

  if (variant === 'button') {
    return (
      <div className="flex items-center space-x-2">
        {showLabel && (
          <span className="text-sm font-medium flex items-center">
            <Store className="w-4 h-4 mr-1" />
            Loja:
          </span>
        )}
        <Badge className={getStoreBadgeColor(currentStore)}>
          {currentStore}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={switchStore}
          className="flex items-center space-x-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Trocar</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showLabel && (
        <label className="text-sm font-medium flex items-center">
          <Store className="w-4 h-4 mr-1" />
          Loja Atual
        </label>
      )}
      <Select value={currentStore} onValueChange={(value: StoreType) => setCurrentStore(value)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Roberto Automóveis">Roberto Automóveis</SelectItem>
          <SelectItem value="RN Multimarcas">RN Multimarcas</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

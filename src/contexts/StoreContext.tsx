
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TipoLoja, DEFAULT_STORES } from '@/types/store';
import { toast } from '@/components/ui/sonner';

interface StoreContextType {
  currentStore: TipoLoja;
  setCurrentStore: (store: TipoLoja) => void;
  switchStore: () => void;
  availableStores: TipoLoja[];
  isLoadingStores: boolean;
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStore, setCurrentStoreState] = useState<TipoLoja>(() => {
    const saved = localStorage.getItem('currentStore');
    return (saved as TipoLoja) || 'Roberto Automóveis';
  });
  const [availableStores, setAvailableStores] = useState<TipoLoja[]>(DEFAULT_STORES);
  const [isLoadingStores, setIsLoadingStores] = useState<boolean>(false);

  const setCurrentStore = (store: TipoLoja) => {
    setCurrentStoreState(store);
    localStorage.setItem('currentStore', store);
  };

  const loadStores = useCallback(async () => {
    try {
      setIsLoadingStores(true);
      const { data, error } = await supabase
        .from('configuration_items')
        .select('name, is_active')
        .eq('category', 'stores')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Erro ao carregar lojas configuradas:', error);
        toast.error('Não foi possível carregar as lojas configuradas');
        return;
      }

      const fetchedStores = (data || [])
        .map((item) => item.name as TipoLoja)
        .filter((name) => !!name && name.trim().length > 0);

      const nextStores = fetchedStores.length > 0 ? fetchedStores : DEFAULT_STORES;
      setAvailableStores(nextStores);

      if (!nextStores.includes(currentStore)) {
        setCurrentStore(nextStores[0]);
      }
    } catch (loadError) {
      console.error('Erro inesperado ao carregar lojas:', loadError);
      toast.error('Erro inesperado ao carregar as lojas');
    } finally {
      setIsLoadingStores(false);
    }
  }, [currentStore]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const switchStore = () => {
    if (availableStores.length === 0) {
      return;
    }

    const currentIndex = availableStores.findIndex((store) => store === currentStore);
    const nextIndex = currentIndex === -1 || currentIndex === availableStores.length - 1
      ? 0
      : currentIndex + 1;
    setCurrentStore(availableStores[nextIndex]);
  };

  const refreshStores = useCallback(async () => {
    await loadStores();
  }, [loadStores]);

  return (
    <StoreContext.Provider value={{
      currentStore,
      setCurrentStore,
      switchStore,
      availableStores,
      isLoadingStores,
      refreshStores
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};

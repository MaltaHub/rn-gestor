
import React, { createContext, useContext, useState, useEffect } from 'react';
import { StoreType } from '@/types/store';

interface StoreContextType {
  currentStore: StoreType;
  setCurrentStore: (store: StoreType) => void;
  switchStore: () => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentStore, setCurrentStoreState] = useState<StoreType>(() => {
    const saved = localStorage.getItem('currentStore');
    return (saved as StoreType) || 'Roberto Automóveis';
  });

  const setCurrentStore = (store: StoreType) => {
    setCurrentStoreState(store);
    localStorage.setItem('currentStore', store);
  };

  const switchStore = () => {
    const newStore: StoreType = currentStore === 'Roberto Automóveis' 
      ? 'RN Multimarcas' 
      : 'Roberto Automóveis';
    setCurrentStore(newStore);
  };

  return (
    <StoreContext.Provider value={{
      currentStore,
      setCurrentStore,
      switchStore
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


import React, { createContext, useContext, useState, useEffect } from "react";
import { Vehicle, Notification } from "@/types";
import { useVehicleOperations } from "./useVehicleOperations";
import { useVehicleFilters } from "./useVehicleFilters";
import { useNotifications } from "./useNotifications";

interface VehicleContextType {
  vehicles: Vehicle[];
  notifications: Notification[];
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  getVehicle: (id: string) => Vehicle | undefined;
  markAllNotificationsAsRead: () => Promise<void>;
  unreadNotificationsCount: number;
  viewMode: 'compact' | 'detailed';
  setViewMode: (mode: 'compact' | 'detailed') => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredVehicles: Vehicle[];
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  isLoading: boolean;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    vehicles, 
    isLoadingVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    getVehicle
  } = useVehicleOperations();
  
  const {
    notifications,
    isLoadingNotifications,
    markAllNotificationsAsRead,
    unreadNotificationsCount
  } = useNotifications();
  
  const {
    viewMode,
    setViewMode,
    sortOption,
    setSortOption,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    filteredVehicles
  } = useVehicleFilters(vehicles);
  
  const isLoading = isLoadingVehicles || isLoadingNotifications;

  return (
    <VehicleContext.Provider 
      value={{
        vehicles,
        notifications,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        getVehicle,
        markAllNotificationsAsRead,
        unreadNotificationsCount,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        searchTerm,
        setSearchTerm,
        filteredVehicles,
        statusFilter,
        setStatusFilter,
        isLoading
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const context = useContext(VehicleContext);
  if (context === undefined) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return context;
};

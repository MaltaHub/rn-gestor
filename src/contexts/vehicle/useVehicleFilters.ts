
import { useState, useEffect } from "react";
import { Vehicle } from "@/types";
import { filterVehicles } from "@/utils/vehicleFilters";

export const useVehicleFilters = (vehicles: Vehicle[]) => {
  // User preferences state
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => {
    const savedMode = localStorage.getItem('viewMode');
    return savedMode === 'detailed' ? 'detailed' : 'compact';
  });
  
  const [sortOption, setSortOption] = useState<string>(() => {
    const savedSort = localStorage.getItem('sortOption');
    return savedSort || 'addedAt_desc';
  });
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
    localStorage.setItem('sortOption', sortOption);
  }, [viewMode, sortOption]);
  
  // Apply filters and sorting to vehicles
  const filteredVehicles = filterVehicles(vehicles, searchTerm, statusFilter, sortOption);

  return {
    viewMode,
    setViewMode,
    sortOption,
    setSortOption,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    filteredVehicles
  };
};

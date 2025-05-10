
import React from "react";
import { useNavigate } from "react-router-dom";
import { useVehicles } from "@/contexts/VehicleContext";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { VehicleList } from "@/components/inventory/VehicleList";

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    filteredVehicles, 
    viewMode, 
    setViewMode, 
    sortOption, 
    setSortOption,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    isLoading
  } = useVehicles();
  
  const handleViewVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
  };

  return (
    <div className="content-container py-6">
      <div className="floating-box mb-6">
        <InventoryFilters 
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          sortOption={sortOption}
          setSortOption={setSortOption}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        <div className="p-4">
          <VehicleList 
            isLoading={isLoading}
            filteredVehicles={filteredVehicles}
            viewMode={viewMode}
            onVehicleClick={handleViewVehicle}
          />
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;


import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVehicles } from "@/contexts/VehicleContext";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { VehicleList } from "@/components/inventory/VehicleList";
import { InventoryDashboard } from "@/components/inventory/InventoryDashboard";
import { AdvancedFilters } from "@/components/inventory/AdvancedFilters";
import { BulkActions } from "@/components/inventory/BulkActions";
import { useInventoryFilters } from "@/hooks/useInventoryFilters";
import { toast } from "@/components/ui/sonner";
import { VehicleWithIndicators } from "@/types";

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    vehicles,
    updateVehicle,
    deleteVehicle,
    viewMode, 
    setViewMode,
    isLoading
  } = useVehicles();

  // Seleção múltipla para ações em lote
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);

  // Filtros integrados
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortOption,
    setSortOption,
    advancedFilters,
    setAdvancedFilters,
    clearAdvancedFilters,
    filteredVehicles
  } = useInventoryFilters(vehicles);
  
  const handleViewVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
  };

  // Funções de seleção múltipla
  const handleSelectAll = () => {
    setSelectedVehicles(filteredVehicles.map(v => v.id));
  };

  const handleDeselectAll = () => {
    setSelectedVehicles([]);
  };

  const handleToggleSelect = (vehicleId: string) => {
    setSelectedVehicles(prev => 
      prev.includes(vehicleId) 
        ? prev.filter(id => id !== vehicleId)
        : [...prev, vehicleId]
    );
  };

  // Ações em lote
  const handleBulkStatusChange = async (vehicleIds: string[], newStatus: 'available' | 'reserved' | 'sold') => {
    try {
      const promises = vehicleIds.map(id => updateVehicle(id, { status: newStatus }));
      await Promise.all(promises);
      toast.success(`${vehicleIds.length} veículo(s) atualizado(s) com sucesso!`);
      setSelectedVehicles([]);
    } catch (error) {
      console.error('Erro ao atualizar veículos:', error);
      toast.error('Erro ao atualizar veículos');
    }
  };

  const handleBulkStoreTransfer = async (vehicleIds: string[], newStore: string) => {
    try {
      const promises = vehicleIds.map(id => updateVehicle(id, { store: newStore as any }));
      await Promise.all(promises);
      toast.success(`${vehicleIds.length} veículo(s) transferido(s) para ${newStore}!`);
      setSelectedVehicles([]);
    } catch (error) {
      console.error('Erro ao transferir veículos:', error);
      toast.error('Erro ao transferir veículos');
    }
  };

  const handleBulkDelete = async (vehicleIds: string[]) => {
    try {
      const promises = vehicleIds.map(id => deleteVehicle(id));
      await Promise.all(promises);
      toast.success(`${vehicleIds.length} veículo(s) excluído(s) com sucesso!`);
      setSelectedVehicles([]);
    } catch (error) {
      console.error('Erro ao excluir veículos:', error);
      toast.error('Erro ao excluir veículos');
    }
  };

  const handleExportSelected = (vehicleIds: string[]) => {
    const selectedVehicleData = vehicles.filter(v => vehicleIds.includes(v.id));
    
    // Preparar dados para CSV
    const csvData = selectedVehicleData.map(vehicle => ({
      Placa: vehicle.plate,
      Modelo: vehicle.model,
      Ano: vehicle.year,
      Cor: vehicle.color,
      Quilometragem: vehicle.mileage,
      Preço: vehicle.price,
      Status: vehicle.status,
      Loja: vehicle.store,
      Local: vehicle.local || '',
      Documentação: vehicle.documentacao || '',
      'Data Adição': new Date(vehicle.added_at).toLocaleDateString('pt-BR')
    }));

    // Converter para CSV
    const headers = Object.keys(csvData[0] || {}).join(',');
    const rows = csvData.map(row => Object.values(row).join(','));
    const csvContent = [headers, ...rows].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `veiculos_selecionados_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`${vehicleIds.length} veículo(s) exportado(s) com sucesso!`);
  };

  return (
    <div className="content-container py-6">
      <div className="floating-box">
        {/* Dashboard de Métricas */}
        <InventoryDashboard vehicles={filteredVehicles} isLoading={isLoading} />

        {/* Filtros Avançados */}
        <AdvancedFilters 
          filters={advancedFilters}
          onFiltersChange={setAdvancedFilters}
          onClearFilters={clearAdvancedFilters}
          totalResults={filteredVehicles.length}
        />

        {/* Filtros Básicos */}
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

        {/* Ações em Lote */}
        <BulkActions
          selectedVehicles={selectedVehicles}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onToggleSelect={handleToggleSelect}
          vehicles={filteredVehicles}
          onBulkStatusChange={handleBulkStatusChange}
          onBulkStoreTransfer={handleBulkStoreTransfer}
          onBulkDelete={handleBulkDelete}
          onExportSelected={handleExportSelected}
        />

        {/* Lista de Veículos */}
        <div className="p-4">
          <VehicleList 
            isLoading={isLoading}
            filteredVehicles={filteredVehicles}
            viewMode={viewMode}
            onVehicleClick={handleViewVehicle}
            selectedVehicles={selectedVehicles}
            onToggleSelect={handleToggleSelect}
          />
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;

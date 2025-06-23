import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVehicles } from "@/contexts/VehicleContext";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { VehicleList } from "@/components/inventory/VehicleList";
import { InventoryDashboard } from "@/components/inventory/InventoryDashboard";
import { AdvancedFilters } from "@/components/inventory/AdvancedFilters";
import { BulkActions } from "@/components/inventory/BulkActions";
import { useInventoryFilters } from "@/hooks/useInventoryFilters";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVehiclesWithImages } from "@/hooks/useVehiclesWithImages";
import { toast } from "@/components/ui/sonner";
import { VehicleWithIndicators } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Car, 
  Filter, 
  Grid3X3, 
  List, 
  Search, 
  Settings,
  CheckCircle2,
  AlertCircle,
  Clock
} from "lucide-react";

// Definindo os tipos corretos para viewMode
type ViewMode = 'table' | 'compact' | 'detailed';

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { 
    updateVehicle,
    deleteVehicle,
    viewMode, 
    setViewMode
  } = useVehicles();

  // Usar o novo hook que carrega veículos com imagens
  const { vehicles, isLoading, refetch } = useVehiclesWithImages();

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

  // Funções de seleção múltipla melhoradas
  const handleSelectAll = () => {
    setSelectedVehicles(filteredVehicles.map(v => v.id));
    toast.success(`${filteredVehicles.length} veículo(s) selecionado(s)`);
  };

  const handleDeselectAll = () => {
    setSelectedVehicles([]);
    toast.info("Seleção removida");
  };

  const handleToggleSelect = (vehicleId: string) => {
    setSelectedVehicles(prev => {
      const newSelection = prev.includes(vehicleId) 
        ? prev.filter(id => id !== vehicleId)
        : [...prev, vehicleId];
      
      // Feedback visual da seleção
      if (newSelection.length > prev.length) {
        toast.success("Veículo adicionado à seleção");
      } else {
        toast.info("Veículo removido da seleção");
      }
      
      return newSelection;
    });
  };

  // Ações em lote
  const handleBulkStatusChange = async (vehicleIds: string[], newStatus: 'available' | 'reserved' | 'sold') => {
    try {
      const promises = vehicleIds.map(id => updateVehicle(id, { status: newStatus }));
      await Promise.all(promises);
      toast.success(`${vehicleIds.length} veículo(s) atualizado(s) com sucesso!`);
      setSelectedVehicles([]);
      refetch(); // Recarregar dados após atualização
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
      refetch(); // Recarregar dados após atualização
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
      refetch(); // Recarregar dados após atualização
    } catch (error) {
      console.error('Erro ao excluir veículos:', error);
      toast.error('Erro ao excluir veículos');
    }
  };

  const handleExportSelected = (vehicleIds: string[]) => {
    const selectedVehicleData = vehicles.filter(v => vehicleIds.includes(v.id));
    
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

    const headers = Object.keys(csvData[0] || {}).join(',');
    const rows = csvData.map(row => Object.values(row).join(','));
    const csvContent = [headers, ...rows].join('\n');

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

  // Estatísticas para o header
  const getStatusCount = (status: string) => {
    return filteredVehicles.filter(v => v.status === status).length;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header Melhorado */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Car className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Estoque de Veículos
                  </CardTitle>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    Gerencie seu inventário de forma eficiente
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {getStatusCount('available')} Disponível
                </Badge>
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  <Clock className="h-3 w-3 mr-1" />
                  {getStatusCount('reserved')} Reservado
                </Badge>
                <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {getStatusCount('sold')} Vendido
                </Badge>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {filteredVehicles.length} veículo{filteredVehicles.length !== 1 ? 's' : ''} encontrado{filteredVehicles.length !== 1 ? 's' : ''}
                </span>
                {selectedVehicles.length > 0 && (
                  <Badge variant="default" className="bg-blue-600">
                    {selectedVehicles.length} selecionado{selectedVehicles.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('detailed' as ViewMode)}
                  className={viewMode === 'detailed' ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('compact' as ViewMode)}
                  className={viewMode === 'compact' ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard de Métricas - Melhorado */}
        {!isMobile && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardContent className="p-6">
              <InventoryDashboard vehicles={filteredVehicles} isLoading={isLoading} />
            </CardContent>
          </Card>
        )}

        {/* Filtros Avançados - Melhorados */}
        {!isMobile && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-slate-600" />
                <CardTitle className="text-lg">Filtros Avançados</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <AdvancedFilters 
                filters={advancedFilters}
                onFiltersChange={setAdvancedFilters}
                onClearFilters={clearAdvancedFilters}
                totalResults={filteredVehicles.length}
              />
            </CardContent>
          </Card>
        )}

        {/* Filtros Básicos - Melhorados */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardContent className="p-6">
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
          </CardContent>
        </Card>

        {/* Ações em Lote - Melhoradas */}
        {selectedVehicles.length > 0 && (
          <Card className="border-0 shadow-lg bg-blue-50/80 backdrop-blur-sm dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
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
            </CardContent>
          </Card>
        )}

        {/* Lista de Veículos - Melhorada */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardContent className="p-6">
            <VehicleList 
              isLoading={isLoading}
              filteredVehicles={filteredVehicles}
              viewMode={viewMode}
              onVehicleClick={handleViewVehicle}
              selectedVehicles={selectedVehicles}
              onToggleSelect={handleToggleSelect}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InventoryPage;

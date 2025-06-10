
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, SlidersHorizontal, ArrowDownUp, LayoutGrid, List, Table } from "lucide-react";

interface InventoryFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  viewMode: 'compact' | 'detailed' | 'table';
  setViewMode: (mode: 'compact' | 'detailed' | 'table') => void;
}

export const InventoryFilters: React.FC<InventoryFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  sortOption,
  setSortOption,
  statusFilter,
  setStatusFilter,
  viewMode,
  setViewMode
}) => {
  const sortOptions = [
    { value: 'price_asc', label: 'Preço ↑', fullLabel: 'Preço (menor para maior)' },
    { value: 'price_desc', label: 'Preço ↓', fullLabel: 'Preço (maior para menor)' },
    { value: 'addedAt_desc', label: 'Novo', fullLabel: 'Data (mais recente)' },
    { value: 'addedAt_asc', label: 'Antigo', fullLabel: 'Data (mais antigo)' },
    { value: 'mileage_asc', label: 'KM ↑', fullLabel: 'Quilometragem (menor para maior)' },
    { value: 'mileage_desc', label: 'KM ↓', fullLabel: 'Quilometragem (maior para menor)' },
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'available', label: 'Disponíveis' },
    { value: 'reserved', label: 'Reservados' },
    { value: 'sold', label: 'Vendidos' },
  ];

  const getViewIcon = () => {
    switch (viewMode) {
      case 'compact':
        return <List className="h-4 w-4" />;
      case 'detailed':
        return <LayoutGrid className="h-4 w-4" />;
      case 'table':
        return <Table className="h-4 w-4" />;
      default:
        return <List className="h-4 w-4" />;
    }
  };

  const getNextViewMode = () => {
    switch (viewMode) {
      case 'compact':
        return 'detailed';
      case 'detailed':
        return 'table';
      case 'table':
        return 'compact';
      default:
        return 'compact';
    }
  };

  return (
    <div className="p-3 md:p-4 border-b space-y-3 md:space-y-0">
      {/* Campo de busca - full width em mobile */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Pesquisar..."
          className="pl-9 touch-friendly"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Botões de ação - organizados para mobile */}
      <div className="flex gap-2 justify-between md:justify-end">
        <div className="flex gap-2 flex-1 md:flex-initial">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="touch-friendly flex-1 md:flex-initial">
                <ArrowDownUp className="h-4 w-4 md:mr-2" />
                <span className="mobile-hidden">Ordenar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white z-50">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setSortOption(option.value)}
                  className={sortOption === option.value ? "bg-muted" : ""}
                >
                  <span className="desktop-hidden">{option.label}</span>
                  <span className="mobile-hidden">{option.fullLabel}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="touch-friendly flex-1 md:flex-initial">
                <SlidersHorizontal className="h-4 w-4 md:mr-2" />
                <span className="mobile-hidden">Status</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white z-50">
              {statusOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={statusFilter === option.value ? "bg-muted" : ""}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <Button
          variant="outline"
          className="touch-friendly"
          onClick={() => setViewMode(getNextViewMode())}
          title={`Alternar para visualização ${getNextViewMode()}`}
        >
          {getViewIcon()}
        </Button>
      </div>
    </div>
  );
};


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
    { value: 'price_asc', label: 'Preço (menor para maior)' },
    { value: 'price_desc', label: 'Preço (maior para menor)' },
    { value: 'addedAt_desc', label: 'Data (mais recente)' },
    { value: 'addedAt_asc', label: 'Data (mais antigo)' },
    { value: 'mileage_asc', label: 'Quilometragem (menor para maior)' },
    { value: 'mileage_desc', label: 'Quilometragem (maior para menor)' },
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
    <div className="p-4 border-b flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Pesquisar por modelo, placa ou cor..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSortOption(option.value)}
                className={sortOption === option.value ? "bg-muted" : ""}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
        <Button
          variant="outline"
          size="icon"
          onClick={() => setViewMode(getNextViewMode())}
          title={`Alternar para visualização ${getNextViewMode()}`}
        >
          {getViewIcon()}
        </Button>
      </div>
    </div>
  );
};

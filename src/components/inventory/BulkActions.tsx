import React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  CheckSquare, 
  Square, 
  MoreHorizontal, 
  Tag, 
  ArrowRightLeft, 
  Edit, 
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Store,
  Settings
} from "lucide-react";
import { VehicleWithIndicators } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

interface BulkActionsProps {
  selectedVehicles: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleSelect: (vehicleId: string) => void;
  vehicles: VehicleWithIndicators[];
  onBulkStatusChange: (vehicleIds: string[], status: 'available' | 'reserved' | 'sold') => void;
  onBulkStoreTransfer: (vehicleIds: string[], store: string) => void;
  onBulkDelete: (vehicleIds: string[]) => void;
  onExportSelected: (vehicleIds: string[]) => void;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  selectedVehicles,
  onSelectAll,
  onDeselectAll,
  onToggleSelect,
  vehicles,
  onBulkStatusChange,
  onBulkStoreTransfer,
  onBulkDelete,
  onExportSelected
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const allSelected = vehicles.length > 0 && selectedVehicles.length === vehicles.length;
  const someSelected = selectedVehicles.length > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  const selectedVehicleData = vehicles.filter(v => selectedVehicles.includes(v.id));

  const getStatusCounts = () => {
    const counts = {
      available: 0,
      reserved: 0,
      sold: 0
    };
    selectedVehicleData.forEach(vehicle => {
      counts[vehicle.status]++;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  const handleStatusChange = (status: 'available' | 'reserved' | 'sold') => {
    onBulkStatusChange(selectedVehicles, status);
  };

  const handleStoreTransfer = (store: string) => {
    onBulkStoreTransfer(selectedVehicles, store);
  };

  const handleDelete = () => {
    if (confirm(`Tem certeza que deseja excluir ${selectedVehicles.length} veículo(s)?`)) {
      onBulkDelete(selectedVehicles);
    }
  };

  const handleExport = () => {
    onExportSelected(selectedVehicles);
  };

  if (!someSelected) {
    return (
      <Card className="mb-4">
        <CardContent className="mobile-compact">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="touch-friendly"
              >
                <Square className="h-4 w-4 mr-2" />
                <span className="desktop-hidden">Selecionar</span>
                <span className="mobile-hidden">Selecionar Todos</span>
              </Button>
              <span className="text-xs md:text-sm text-muted-foreground">
                {vehicles.length} veículo{vehicles.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-blue-900 dark:text-blue-100">
            {selectedVehicles.length} veículo{selectedVehicles.length !== 1 ? 's' : ''} selecionado{selectedVehicles.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            className="text-xs bg-white/50 hover:bg-white/80 border-blue-300"
          >
            Selecionar Todos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDeselectAll}
            className="text-xs bg-white/50 hover:bg-white/80 border-blue-300"
          >
            Limpar Seleção
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Alterar Status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="bg-white/50 hover:bg-white/80 border-blue-300">
              <Settings className="h-4 w-4 mr-2" />
              Alterar Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => handleStatusChange('available')}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
              Marcar como Disponível
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange('reserved')}>
              <Clock className="h-4 w-4 mr-2 text-yellow-600" />
              Marcar como Reservado
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange('sold')}>
              <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
              Marcar como Vendido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Transferir Loja */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="bg-white/50 hover:bg-white/80 border-blue-300">
              <Store className="h-4 w-4 mr-2" />
              Transferir Loja
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => handleStoreTransfer('Loja A')}>
              Transferir para Loja A
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStoreTransfer('Loja B')}>
              Transferir para Loja B
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStoreTransfer('Loja C')}>
              Transferir para Loja C
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Exportar */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="bg-white/50 hover:bg-white/80 border-blue-300"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>

        {/* Excluir */}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          className="bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </Button>
      </div>
    </div>
  );
};

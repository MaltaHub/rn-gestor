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
  AlertCircle
} from "lucide-react";
import { VehicleWithIndicators } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface BulkActionsProps {
  selectedVehicles: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleSelect: (vehicleId: string) => void;
  vehicles: VehicleWithIndicators[];
  onBulkStatusChange: (vehicleIds: string[], newStatus: 'available' | 'reserved' | 'sold') => Promise<void>;
  onBulkStoreTransfer: (vehicleIds: string[], newStore: string) => Promise<void>;
  onBulkDelete: (vehicleIds: string[]) => Promise<void>;
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
    <>
      <Card className="mb-4 border-primary">
        <CardContent className="mobile-compact">
          <div className="space-y-3 md:space-y-0">
            {/* Linha 1: Seleção e badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="touch-friendly"
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4 mr-2" />
                  ) : (
                    <Square className="h-4 w-4 mr-2" />
                  )}
                  <span className="desktop-hidden">{allSelected ? 'Desmarcar' : 'Todos'}</span>
                  <span className="mobile-hidden">{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                </Button>
                
                <Badge variant="secondary" className="text-xs">
                  {selectedVehicles.length}
                </Badge>
              </div>
            </div>

            {/* Linha 2: Status dos selecionados - stack em mobile */}
            <div className="mobile-stack gap-2">
              {statusCounts.available > 0 && (
                <Badge variant="outline" className="text-green-600 text-xs">
                  {statusCounts.available} disponível{statusCounts.available !== 1 ? 'eis' : ''}
                </Badge>
              )}
              {statusCounts.reserved > 0 && (
                <Badge variant="outline" className="text-yellow-600 text-xs">
                  {statusCounts.reserved} reservado{statusCounts.reserved !== 1 ? 's' : ''}
                </Badge>
              )}
              {statusCounts.sold > 0 && (
                <Badge variant="outline" className="text-red-600 text-xs">
                  {statusCounts.sold} vendido{statusCounts.sold !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* Linha 3: Ações */}
            <div className="mobile-stack gap-2">
              {/* Ações Rápidas */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkStatusChange(selectedVehicles, 'available')}
                disabled={statusCounts.available === selectedVehicles.length}
                className="touch-friendly flex-1 md:flex-initial"
              >
                <Tag className="h-4 w-4 mr-2" />
                <span className="desktop-hidden">Disponível</span>
                <span className="mobile-hidden">Marcar Disponível</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportSelected(selectedVehicles)}
                className="touch-friendly flex-1 md:flex-initial"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>

              {/* Menu de Ações */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="touch-friendly">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white z-50">
                  <DropdownMenuItem onClick={() => onBulkStatusChange(selectedVehicles, 'reserved')}>
                    <Tag className="h-4 w-4 mr-2 text-yellow-600" />
                    Marcar como Reservado
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => onBulkStatusChange(selectedVehicles, 'sold')}>
                    <Tag className="h-4 w-4 mr-2 text-red-600" />
                    Marcar como Vendido
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => onBulkStoreTransfer(selectedVehicles, 'Roberto Automóveis')}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Transferir para Roberto
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => onBulkStoreTransfer(selectedVehicles, 'RN Multimarcas')}>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Transferir para RN
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem 
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Selecionados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedVehicles.length} veículo{selectedVehicles.length !== 1 ? 's' : ''}.
              Esta ação não pode ser desfeita.
              
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium mb-2">Veículos que serão excluídos:</div>
                <div className="space-y-1">
                  {selectedVehicleData.slice(0, 5).map(vehicle => (
                    <div key={vehicle.id} className="text-xs text-muted-foreground">
                      {vehicle.plate} - {vehicle.model}
                    </div>
                  ))}
                  {selectedVehicles.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      ... e mais {selectedVehicles.length - 5} veículo{selectedVehicles.length - 5 !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onBulkDelete(selectedVehicles);
                setShowDeleteDialog(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir Veículos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

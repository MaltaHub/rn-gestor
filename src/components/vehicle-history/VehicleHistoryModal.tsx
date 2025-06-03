
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit } from "lucide-react";
import { useVehicleHistory } from "@/hooks/useVehicleHistory";
import { truncateText } from "@/utils/notificationUtils";
import { HistoryCard } from "./HistoryCard";

interface VehicleHistoryModalProps {
  vehicleId: string;
  vehicleName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VehicleHistoryModal: React.FC<VehicleHistoryModalProps> = ({
  vehicleId,
  vehicleName,
  isOpen,
  onClose
}) => {
  const { history, isLoadingHistory } = useVehicleHistory(vehicleId);

  // Truncar o nome do veículo para 20 caracteres
  const truncatedName = truncateText(vehicleName, 20);

  // Agrupar alterações por timestamp (mesmo momento)
  const groupedHistory = React.useMemo(() => {
    const groups: { [key: string]: typeof history } = {};
    
    history.forEach((item) => {
      const timestamp = item.changed_at;
      if (!groups[timestamp]) {
        groups[timestamp] = [];
      }
      groups[timestamp].push(item);
    });

    // Converter para array e ordenar por data
    return Object.entries(groups)
      .map(([timestamp, changes]) => ({ timestamp, changes }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [history]);

  if (isLoadingHistory) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle 
              className="flex items-center gap-2"
              title={vehicleName} // Tooltip com nome completo
            >
              <Edit className="h-5 w-5" />
              Histórico de Alterações - {truncatedName}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-300 rounded w-1/4 mx-auto mb-4"></div>
              <div className="h-4 bg-gray-300 rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-gray-500 mt-4">Carregando histórico...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle 
            className="flex items-center gap-2"
            title={vehicleName} // Tooltip com nome completo
          >
            <Edit className="h-5 w-5" />
            Histórico de Alterações - {truncatedName}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[65vh] pr-4">
          {groupedHistory.length === 0 ? (
            <div className="text-center py-12">
              <Edit className="h-16 w-16 text-gray-400 mx-auto mb-6" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">Nenhuma alteração</h3>
              <p className="text-gray-500">Este veículo ainda não teve alterações registradas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedHistory.map(({ timestamp, changes }) => (
                <HistoryCard
                  key={timestamp}
                  changes={changes}
                  isGrouped={changes.length > 1}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

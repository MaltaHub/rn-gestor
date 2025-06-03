
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, User, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useVehicleHistory } from "@/hooks/useVehicleHistory";
import { formatFieldName, formatValue } from "@/utils/notificationUtils";

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

  if (isLoadingHistory) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Histórico de Alterações - {vehicleName}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-gray-500">Carregando histórico...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Histórico de Alterações - {vehicleName}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] pr-4">
          {history.length === 0 ? (
            <div className="text-center py-8">
              <Edit className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600">Nenhuma alteração</h3>
              <p className="mt-2 text-gray-500">Este veículo ainda não teve alterações registradas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">
                        {formatFieldName(item.field_name)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="h-4 w-4" />
                      {formatDistanceToNow(new Date(item.changed_at), { 
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">Valor Anterior:</p>
                      <p className="text-sm bg-red-50 text-red-800 px-2 py-1 rounded">
                        {item.old_value ? formatValue(item.field_name, item.old_value) : 'Vazio'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">Novo Valor:</p>
                      <p className="text-sm bg-green-50 text-green-800 px-2 py-1 rounded">
                        {formatValue(item.field_name, item.new_value)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    Alterado por: <span className="font-medium">{item.user_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

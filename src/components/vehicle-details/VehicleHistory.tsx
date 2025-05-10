
import React, { useState, useEffect } from "react";
import { getVehicleHistory } from "@/services/vehicleService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { History, ClockIcon } from "lucide-react";
import { format } from "date-fns";

interface VehicleHistoryProps {
  vehicleId: string;
}

interface HistoryItem {
  id: string;
  vehicle_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_at: string;
  user_profiles: {
    name: string;
  } | null;
}

export const VehicleHistory: React.FC<VehicleHistoryProps> = ({ vehicleId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const historyData = await getVehicleHistory(vehicleId);
        // Cast the result to the correct type
        setHistory(historyData as unknown as HistoryItem[]);
      } catch (error) {
        console.error("Error loading vehicle history:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadHistory();
  }, [vehicleId]);
  
  // Helper function to get user-friendly field names
  const getFieldLabel = (fieldName: string): string => {
    const fieldLabels: Record<string, string> = {
      'plate': 'Placa',
      'model': 'Modelo',
      'color': 'Cor',
      'mileage': 'Quilometragem',
      'image_url': 'Imagem',
      'price': 'Preço',
      'year': 'Ano',
      'description': 'Descrição',
      'status': 'Status',
      'specifications.engine': 'Motor',
      'specifications.transmission': 'Transmissão',
      'specifications.fuel': 'Combustível'
    };
    
    return fieldLabels[fieldName] || fieldName;
  };
  
  // Helper function to format status values
  const formatValue = (fieldName: string, value: string): string => {
    if (fieldName === 'status') {
      const statusLabels: Record<string, string> = {
        'available': 'Disponível',
        'reserved': 'Reservado',
        'sold': 'Vendido'
      };
      return statusLabels[value] || value;
    }
    
    if (fieldName === 'price') {
      return `R$ ${parseFloat(value).toLocaleString()}`;
    }
    
    if (fieldName === 'mileage') {
      return `${parseInt(value).toLocaleString()} km`;
    }
    
    return value;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-vehicleApp-red" />
          Histórico de Alterações
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <ClockIcon className="h-6 w-6 animate-spin text-vehicleApp-red" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-center text-vehicleApp-mediumGray py-4">
            Nenhuma alteração registrada
          </p>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {history.map((item, index) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {getFieldLabel(item.field_name)}
                      </Badge>
                      <span className="text-sm text-vehicleApp-darkGray">
                        por <span className="font-semibold">{item.user_profiles?.name || 'Usuário'}</span>
                      </span>
                    </div>
                    <span className="text-xs text-vehicleApp-mediumGray">
                      {format(new Date(item.changed_at), "dd/MM/yyyy 'às' HH:mm")}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    <div className="text-sm">
                      <span className="text-vehicleApp-mediumGray">De: </span>
                      <span className="font-medium line-through decoration-vehicleApp-red/50">
                        {item.old_value ? formatValue(item.field_name, item.old_value) : <em>vazio</em>}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-vehicleApp-mediumGray">Para: </span>
                      <span className="font-medium text-vehicleApp-darkGray">
                        {formatValue(item.field_name, item.new_value)}
                      </span>
                    </div>
                  </div>
                  
                  {index < history.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

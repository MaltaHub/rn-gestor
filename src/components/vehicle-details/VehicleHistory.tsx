
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getVehicleHistory } from "@/services/vehicleService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { History, ClockIcon, AlertCircle, Filter } from "lucide-react";
import { format } from "date-fns";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";

interface VehicleHistoryProps {
  vehicleId: string;
}

// Updated interface to match the structure from vehicle_history_with_user view
interface HistoryItem {
  id: string;
  vehicle_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  changed_by: string;
  changed_at: string;
  name: string | null;
  user_id: string | null;
}

export const VehicleHistory: React.FC<VehicleHistoryProps> = ({ vehicleId }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const historyData = await getVehicleHistory(vehicleId);
        setHistory(historyData as HistoryItem[]);
      } catch (err) {
        console.error("Error loading vehicle history:", err);
        setError("Não foi possível carregar o histórico de alterações");
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

  // Navigate to collaborator details page
  const handleCollaboratorClick = (userId: string) => {
    if (userId) {
      navigate(`/collaborator/${userId}`);
    }
  };

  // Get unique field names for the filter dropdown
  const uniqueFieldNames = Array.from(new Set(history.map(item => item.field_name)));
  
  // Filter history by selected field
  const filteredHistory = fieldFilter === "all" 
    ? history 
    : history.filter(item => item.field_name === fieldFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-vehicleApp-red" />
          Histórico de Alterações
        </CardTitle>
        <div className="w-48">
          <Select value={fieldFilter} onValueChange={setFieldFilter}>
            <SelectTrigger>
              <div className="flex items-center">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrar por campo" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os campos</SelectItem>
              {uniqueFieldNames.map(fieldName => (
                <SelectItem key={fieldName} value={fieldName}>
                  {getFieldLabel(fieldName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <ClockIcon className="h-6 w-6 animate-spin text-vehicleApp-red" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-4 text-center space-y-2">
            <AlertCircle className="h-6 w-6 text-vehicleApp-red" />
            <p className="text-vehicleApp-mediumGray">{error}</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <p className="text-center text-vehicleApp-mediumGray py-4">
            Nenhuma alteração registrada
          </p>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {filteredHistory.map((item, index) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {getFieldLabel(item.field_name)}
                      </Badge>
                      <span className="text-sm text-vehicleApp-darkGray">
                        por{" "}
                        <span 
                          className="font-semibold cursor-pointer hover:text-vehicleApp-red hover:underline"
                          onClick={() => handleCollaboratorClick(item.changed_by)}
                        >
                          {item.name || 'Usuário'}
                        </span>
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
                  
                  {index < filteredHistory.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

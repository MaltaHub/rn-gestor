
import { useState, useEffect } from "react";
import { getVehicleHistory } from "@/services/vehicle/vehicleHistoryService";

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

export const useVehicleHistory = (vehicleId: string) => {
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

  // Get unique field names for the filter dropdown
  const uniqueFieldNames = Array.from(new Set(history.map(item => item.field_name)));
  
  // Filter history by selected field
  const filteredHistory = fieldFilter === "all" 
    ? history 
    : history.filter(item => item.field_name === fieldFilter);

  return {
    history,
    isLoading,
    error,
    fieldFilter,
    setFieldFilter,
    filteredHistory,
    uniqueFieldNames,
    getFieldLabel,
    formatValue
  };
};

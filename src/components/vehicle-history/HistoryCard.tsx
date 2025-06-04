
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleHistory } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";

interface HistoryCardProps {
  history: VehicleHistory;
}

export const HistoryCard: React.FC<HistoryCardProps> = ({ history }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const getFieldDisplayName = (fieldName: string) => {
    const fieldNames: Record<string, string> = {
      plate: 'Placa',
      model: 'Modelo',
      color: 'Cor',
      mileage: 'Quilometragem',
      price: 'Preço',
      year: 'Ano',
      status: 'Status',
      description: 'Descrição',
      image_url: 'Imagem Principal'
    };
    return fieldNames[fieldName] || fieldName;
  };

  const formatValue = (value: string | null, fieldName: string) => {
    if (value === null) return "Não informado";
    
    if (fieldName === 'price') {
      const numValue = parseFloat(value);
      return `R$ ${numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    
    if (fieldName === 'mileage') {
      return `${parseInt(value).toLocaleString('pt-BR')} km`;
    }
    
    if (fieldName === 'status') {
      const statusMap: Record<string, string> = {
        'available': 'Disponível',
        'sold': 'Vendido',
        'reserved': 'Reservado'
      };
      return statusMap[value] || value;
    }
    
    return value;
  };

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <UserAvatar
              src={null} // Avatar será implementado quando tivermos dados de usuário
              alt={history.user_name}
              fallback={history.user_name.slice(0, 2)}
              className="h-8 w-8"
            />
            <div>
              <p className="font-medium">{history.user_name}</p>
              <p className="text-sm text-gray-500">{formatDate(history.changed_at)}</p>
            </div>
          </div>
          <Badge variant="outline">
            {getFieldDisplayName(history.field_name)}
          </Badge>
        </div>
        
        <div className="mt-3 pl-11">
          <div className="text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-gray-500">De:</span>
              <span className="line-through text-red-600">
                {formatValue(history.old_value, history.field_name)}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-gray-500">Para:</span>
              <span className="text-green-600 font-medium">
                {formatValue(history.new_value, history.field_name)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};


import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleHistory } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";

interface HistoryCardProps {
  history?: VehicleHistory;
  changes?: VehicleHistory[];
  isGrouped?: boolean;
}

export const HistoryCard: React.FC<HistoryCardProps> = ({ history, changes, isGrouped }) => {
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

  // Se é um grupo de alterações, use o primeiro item para informações do usuário e data
  const displayHistory = changes && changes.length > 0 ? changes[0] : history;
  
  if (!displayHistory) return null;

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <UserAvatar
              src={null} // Avatar será implementado quando tivermos dados de usuário
              alt={displayHistory.user_name}
              fallback={displayHistory.user_name.slice(0, 2)}
              className="h-8 w-8"
            />
            <div>
              <p className="font-medium">{displayHistory.user_name}</p>
              <p className="text-sm text-gray-500">{formatDate(displayHistory.changed_at)}</p>
            </div>
          </div>
          {isGrouped && (
            <Badge variant="secondary">
              {changes?.length} alterações
            </Badge>
          )}
        </div>
        
        <div className="space-y-3 pl-11">
          {changes && changes.length > 0 ? (
            // Mostrar múltiplas alterações
            changes.map((change, index) => (
              <div key={index} className="border-l-2 border-gray-200 pl-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {getFieldDisplayName(change.field_name)}
                  </Badge>
                </div>
                <div className="text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">De:</span>
                    <span className="line-through text-red-600">
                      {formatValue(change.old_value, change.field_name)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-gray-500">Para:</span>
                    <span className="text-green-600 font-medium">
                      {formatValue(change.new_value, change.field_name)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // Mostrar alteração única
            history && (
              <>
                <div className="flex items-center space-x-2 mb-2">
                  <Badge variant="outline">
                    {getFieldDisplayName(history.field_name)}
                  </Badge>
                </div>
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
              </>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
};

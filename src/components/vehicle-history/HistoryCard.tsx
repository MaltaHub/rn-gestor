
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronDown, ChevronUp, Calendar, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VehicleHistory } from "@/types";
import { formatFieldName, formatValue } from "@/utils/notificationUtils";

interface HistoryCardProps {
  changes: VehicleHistory[];
  isGrouped: boolean;
}

export const HistoryCard: React.FC<HistoryCardProps> = ({ changes, isGrouped }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const firstChange = changes[0];
  
  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isGrouped && changes.length > 1) {
    return (
      <Card className="mb-4 border border-gray-200 hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                  {getUserInitials(firstChange.user_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {changes.length} campos alterados
                </Badge>
                <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{firstChange.user_name}</span>
                  <Calendar className="h-4 w-4 ml-2" />
                  <span>{formatDateTime(firstChange.changed_at)}</span>
                </div>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {isExpanded ? 'Ocultar' : 'Detalhar'}
            </Button>
          </div>

          {isExpanded && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              {changes.map((change) => (
                <div key={change.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-white">
                      {formatFieldName(change.field_name)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">De:</p>
                      <div className="bg-red-50 text-red-800 px-3 py-2 rounded text-sm">
                        {change.old_value ? formatValue(change.field_name, change.old_value) : 'Vazio'}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">Para:</p>
                      <div className="bg-green-50 text-green-800 px-3 py-2 rounded text-sm">
                        {formatValue(change.field_name, change.new_value)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Card individual para uma única alteração
  const change = firstChange;
  return (
    <Card className="mb-4 border border-gray-200 hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
              {getUserInitials(change.user_name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {formatFieldName(change.field_name)}
              </Badge>
              <span className="text-sm text-gray-500">foi alterado</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">De:</p>
                <div className="bg-red-50 text-red-800 px-3 py-2 rounded text-sm">
                  {change.old_value ? formatValue(change.field_name, change.old_value) : 'Vazio'}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Para:</p>
                <div className="bg-green-50 text-green-800 px-3 py-2 rounded text-sm">
                  {formatValue(change.field_name, change.new_value)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="font-medium">{change.user_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{formatDateTime(change.changed_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

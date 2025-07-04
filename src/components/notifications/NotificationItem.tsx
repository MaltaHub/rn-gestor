
import React from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2, Car, AlertCircle, CheckCircle, Clock, RotateCcw } from "lucide-react";
import { Notification } from "@/types";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  onVehicleClick: (vehicleId: string) => void;
  isHidden?: boolean;
}

const getNotificationIcon = (message: string) => {
  if (message.includes("adicionado")) return <Car className="h-4 w-4" />;
  if (message.includes("Vendido")) return <CheckCircle className="h-4 w-4" />;
  if (message.includes("Reservado")) return <Clock className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
};

const getNotificationColor = (message: string, isHidden: boolean) => {
  if (isHidden) return "bg-gray-50 border-gray-200 opacity-75";
  if (message.includes("adicionado")) return "bg-blue-50 border-blue-200";
  if (message.includes("Vendido")) return "bg-green-50 border-green-200";
  if (message.includes("Reservado")) return "bg-yellow-50 border-yellow-200";
  return "bg-gray-50 border-gray-200";
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onHide,
  onRestore,
  onVehicleClick,
  isHidden = false
}) => {
  const handleMarkAsRead = (event: React.MouseEvent) => {
    event.stopPropagation();
    onMarkAsRead(notification.id);
  };

  const handleHide = (event: React.MouseEvent) => {
    event.stopPropagation();
    onHide(notification.id);
  };

  const handleRestore = (event: React.MouseEvent) => {
    event.stopPropagation();
    onRestore(notification.id);
  };

  const handleClick = () => {
    if (!isHidden) {
      onVehicleClick(notification.vehicleId);
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border hover:bg-gray-50 transition-colors ${
        !notification.is_read && !isHidden
          ? `${getNotificationColor(notification.message, isHidden)} border-l-4 cursor-pointer` 
          : `${getNotificationColor(notification.message, isHidden)} ${!isHidden ? 'cursor-pointer' : ''}`
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className={`mt-1 ${!notification.is_read && !isHidden ? 'text-blue-600' : 'text-gray-400'}`}>
            {getNotificationIcon(notification.message)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold ${isHidden ? 'text-gray-500' : 'text-vehicleApp-black'}`}>
                {notification.message}
              </h3>
              {!notification.is_read && !isHidden && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                  Nova
                </Badge>
              )}
              {isHidden && (
                <Badge variant="outline" className="bg-gray-100 text-gray-600 text-xs">
                  Removida
                </Badge>
              )}
            </div>
            
            <p className={`text-sm mb-2 ${isHidden ? 'text-gray-400' : 'text-vehicleApp-mediumGray'}`}>
              {notification.details}
            </p>
            
            <div className="flex items-center gap-2 text-xs text-vehicleApp-mediumGray">
              <span>Placa: {notification.vehicle_plate}</span>
              <span>•</span>
              <span>
                {formatDistanceToNow(new Date(notification.created_at), { 
                  addSuffix: true,
                  locale: ptBR
                })}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 ml-4">
          {isHidden ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              title="Restaurar notificação"
              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {!notification.is_read && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAsRead}
                  title="Marcar como lida"
                  className="h-8 w-8 p-0"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleHide}
                title="Remover notificação"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

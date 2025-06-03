
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVehicles } from "@/contexts/VehicleContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Trash2 } from "lucide-react";

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, deleteNotification } = useVehicles();

  const goToVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
  };

  const handleMarkAsRead = async (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    await markNotificationAsRead(notificationId);
  };

  const handleDeleteNotification = async (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    await deleteNotification(notificationId);
  };

  return (
    <div className="content-container py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Central de Notificações</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-10">
              <h3 className="text-xl font-medium text-gray-600">Nenhuma notificação</h3>
              <p className="mt-2 text-gray-500">Quando houver atualizações no estoque, elas aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer ${
                    !notification.is_read ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => goToVehicle(notification.vehicleId)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-vehicleApp-black">{notification.message}</h3>
                      <p className="mt-1 text-vehicleApp-mediumGray text-sm">{notification.details}</p>
                      <span className="text-xs text-vehicleApp-mediumGray">
                        {formatDistanceToNow(new Date(notification.created_at), { 
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {!notification.is_read && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleMarkAsRead(notification.id, e)}
                          title="Marcar como lida"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleDeleteNotification(notification.id, e)}
                        title="Excluir notificação"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;

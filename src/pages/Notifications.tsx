
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVehicles } from "@/contexts/VehicleContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markAllNotificationsAsRead } = useVehicles();

  useEffect(() => {
    markAllNotificationsAsRead();
  }, [markAllNotificationsAsRead]);

  const goToVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
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
                  className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => goToVehicle(notification.vehicleId)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-vehicleApp-black">{notification.message}</h3>
                      <p className="mt-1 text-vehicleApp-mediumGray text-sm">{notification.details}</p>
                    </div>
                    <span className="text-xs text-vehicleApp-mediumGray">
                      {formatDistanceToNow(new Date(notification.createdAt), { 
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </span>
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

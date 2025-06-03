
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationFilters } from "@/components/notifications/NotificationFilters";
import { CheckCheck, Bell } from "lucide-react";

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    notifications,
    hiddenNotifications,
    isLoadingNotifications,
    markAsRead, 
    hideNotification,
    restoreNotification,
    markAllAsRead,
    unreadCount,
    hiddenCount
  } = useNotifications();
  
  const [filter, setFilter] = useState<'all' | 'unread' | 'read' | 'hidden'>('all');

  const allNotifications = [...notifications, ...hiddenNotifications];
  
  const filteredNotifications = allNotifications.filter(notification => {
    if (filter === 'unread') return !notification.is_read && !notification.is_hidden;
    if (filter === 'read') return notification.is_read && !notification.is_hidden;
    if (filter === 'hidden') return notification.is_hidden;
    if (filter === 'all') return !notification.is_hidden;
    return true;
  });

  const goToVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  if (isLoadingNotifications) {
    return (
      <div className="content-container py-6">
        <div className="text-center py-10">
          <p className="text-gray-500">Carregando notificações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6" />
            <div>
              <CardTitle>Central de Notificações</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {unreadCount > 0 
                  ? `${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''}`
                  : 'Todas as notificações estão em dia'
                }
              </p>
            </div>
          </div>
          
          {unreadCount > 0 && filter !== 'hidden' && (
            <Button 
              variant="outline" 
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-2"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todas como lidas
            </Button>
          )}
        </CardHeader>
        
        <CardContent>
          {allNotifications.length === 0 ? (
            <div className="text-center py-10">
              <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-600">Nenhuma notificação</h3>
              <p className="mt-2 text-gray-500">Quando houver atualizações no estoque, elas aparecerão aqui.</p>
            </div>
          ) : (
            <>
              <NotificationFilters
                activeFilter={filter}
                onFilterChange={setFilter}
                totalCount={notifications.length}
                unreadCount={unreadCount}
                hiddenCount={hiddenCount}
              />
              
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    {filter === 'unread' && 'Nenhuma notificação não lida'}
                    {filter === 'read' && 'Nenhuma notificação lida'}
                    {filter === 'hidden' && 'Nenhuma notificação removida'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                      onHide={hideNotification}
                      onRestore={restoreNotification}
                      onVehicleClick={goToVehicle}
                      isHidden={notification.is_hidden}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;

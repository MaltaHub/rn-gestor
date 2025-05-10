
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from '@/components/ui/button';
import { Menu, Package, Plus, User, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVehicles } from '@/contexts/VehicleContext';
import { usePermission } from '@/contexts/PermissionContext';
import { Badge } from '@/components/ui/badge';
import { Outlet } from 'react-router-dom';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { unreadNotificationsCount } = useVehicles();
  const { checkPermission } = usePermission();

  // Definir os níveis de permissão necessários para cada área
  const VIEW_LEVEL = 1;  // Nível para visualizar
  const MANAGE_LEVEL = 5; // Nível para gerenciar

  const menuItems = [
    { 
      name: 'Estoque', 
      path: '/inventory', 
      icon: Package,
      requiredArea: 'inventory' as const,
      requiredLevel: VIEW_LEVEL
    },
    { 
      name: 'Adicionar Veículo', 
      path: '/add-vehicle', 
      icon: Plus,
      requiredArea: 'add_vehicle' as const,
      requiredLevel: MANAGE_LEVEL
    },
    { 
      name: 'Perfil', 
      path: '/profile', 
      icon: User,
      requiredArea: null // Todos têm acesso ao perfil
    },
    { 
      name: 'Notificações', 
      path: '/notifications', 
      icon: Bell,
      badge: unreadNotificationsCount,
      requiredArea: null // Todos têm acesso às notificações
    }
  ];

  // Filtra os itens do menu com base nas permissões
  const filteredMenuItems = menuItems.filter(item => {
    if (item.requiredArea === null) return true; // Se não requer permissão específica
    return checkPermission(item.requiredArea, item.requiredLevel);
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r shadow-sm">
          <div className="p-4 h-14 flex items-center border-b">
            <h1 className="text-xl font-bold">RN GESTOR</h1>
          </div>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredMenuItems.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton 
                        data-active={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                      >
                        <div className="flex items-center w-full">
                          <item.icon className="mr-2 h-5 w-5" />
                          <span>{item.name}</span>
                          {item.badge && item.badge > 0 && (
                            <Badge className="ml-auto bg-vehicleApp-red">{item.badge}</Badge>
                          )}
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <div className="mt-auto p-4">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={/*logout*/}
              >
                Menu
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-white flex items-center px-4 justify-between shadow-sm">
            <div className="flex items-center">
              <SidebarTrigger>
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <h1 className="text-xl font-bold ml-2">
                {menuItems.find(item => item.path === location.pathname)?.name || 'AutoStock'}
              </h1>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto bg-vehicleApp-lightGray p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

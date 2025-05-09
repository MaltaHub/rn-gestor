
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from '@/components/ui/button';
import { Menu, Package, Plus, User, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVehicles } from '@/contexts/VehicleContext';
import { Badge } from '@/components/ui/badge';
import { Outlet } from 'react-router-dom';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { unreadNotificationsCount } = useVehicles();

  const menuItems = [
    { 
      name: 'Estoque', 
      path: '/inventory', 
      icon: Package 
    },
    { 
      name: 'Adicionar Veículo', 
      path: '/add-vehicle', 
      icon: Plus 
    },
    { 
      name: 'Perfil', 
      path: '/profile', 
      icon: User 
    },
    { 
      name: 'Notificações', 
      path: '/notifications', 
      icon: Bell,
      badge: unreadNotificationsCount
    }
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r shadow-sm">
          <div className="p-4 h-14 flex items-center border-b">
            <h1 className="text-xl font-bold">AutoStock</h1>
          </div>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
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
                onClick={logout}
              >
                Sair
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-white flex items-center px-4 justify-between shadow-sm">
            <div className="flex items-center">
              <SidebarTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
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

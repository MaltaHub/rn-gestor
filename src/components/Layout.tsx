
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from "@/components/ui/sidebar";
import { Button } from '@/components/ui/button';
import { Menu, Package, Plus, User, Bell, LogOut, Users, Shield, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVehicles } from '@/contexts/VehicleContext';
import { usePermission } from '@/contexts/PermissionContext';
import { Outlet } from 'react-router-dom';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { unreadNotificationsCount } = useVehicles();
  const { checkPermission, userRole } = usePermission();

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
      name: 'Colaboradores', 
      path: '/collaborators', 
      icon: Users,
      requiredArea: null // Todos têm acesso aos colaboradores
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
    },
    // Nova opção de menu - Permissões, apenas para admin e gerente
    { 
      name: 'Permissões', 
      path: '/roles', 
      icon: Shield,
      requiredArea: null,
      requiredRole: ['Administrador', 'Gerente'] // Apenas admin e gerente tem acesso
    },
    // Nova opção de menu - Tarefas, apenas para secretários
    {
      name: 'Tarefas',
      path: '/tasks',
      icon: ClipboardList,
      requiredArea: null,
      requiredRole: ['Secretário'] // Apenas secretários têm acesso
    }
  ];

  // Filtra os itens do menu com base nas permissões
  const filteredMenuItems = menuItems.filter(item => {
    // Verifica permissão por área
    if (item.requiredArea !== null) {
      return checkPermission(item.requiredArea, item.requiredLevel);
    }
    
    // Verifica permissão por cargo
    if (item.requiredRole && Array.isArray(item.requiredRole)) {
      return userRole && item.requiredRole.includes(userRole);
    }
    
    // Se não requer permissão específica
    return true;
  });

  const handleLogout = () => {
    if (logout) {
      logout();
    }
  };

  return (
    <div className="min-h-screen flex w-full">
      <Sidebar
        menuItems={filteredMenuItems}
        currentPath={location.pathname}
        onMenuItemClick={(path) => navigate(path)}
        onLogout={handleLogout}
        userRole={userRole}
      />

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b bg-white flex items-center px-4 justify-between shadow-sm">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
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
  );
};

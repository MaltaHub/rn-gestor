import React from "react";
import {
  Home,
  LayoutDashboard,
  Warehouse,
  Bell,
  Shield,
  ClipboardList
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePermission } from "@/contexts/PermissionContext";

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { user } = useAuth();
  const { userRole } = usePermission();
  const location = useLocation();

  // Função para verificar se o link está ativo
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Função para renderizar os links de navegação com base no cargo do usuário
  const renderNavigationLinks = (userRole: string | null) => {
    // Links básicos para todos os usuários
    let links = [
      { to: "/inventory", icon: <Warehouse className="h-5 w-5" />, text: "Estoque" },
    ];

    // Links específicos para cada cargo
    if (userRole === 'Secretário') {
      links.push(
        { to: "/tasks", icon: <ClipboardList className="h-5 w-5" />, text: "Tarefas" }
      );
    } else {
      links.push(
        { to: "/notifications", icon: <Bell className="h-5 w-5" />, text: "Notificações" }
      );
    }

    // Links adicionais para usuários com permissão administrativa
    if (userRole === 'Gerente' || userRole === 'Administrador') {
      links.push(
        { to: "/role-management", icon: <Shield className="h-5 w-5" />, text: "Gerenciar Cargos" }
      );
    }

    return links;
  };

  return (
    <div className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 ${className}`}>
      <div className="flex-grow flex flex-col overflow-y-auto border-r bg-gray-100">
        <div className="flex-shrink-0 flex items-center justify-center h-16 border-b">
          <h1 className="text-lg font-bold">Vehicle App</h1>
        </div>
        <nav className="flex-1 px-2 py-4 bg-gray-100">
          {user ? (
            <div className="flex items-center px-2 py-4 space-x-4">
              <Avatar>
                <AvatarImage src={user?.user_metadata?.avatar_url as string} />
                <AvatarFallback>{user?.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold">{user?.user_metadata?.name as string}</h2>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
          ) : null}
          {renderNavigationLinks(userRole).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={`flex items-center px-2 py-2 mt-1 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-200 ${
                isActive(link.to) ? 'bg-gray-200' : ''
              }`}
            >
              {link.icon}
              <span className="ml-3">{link.text}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;

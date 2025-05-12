
import React from "react";
import {
  Home,
  LayoutDashboard,
  Warehouse,
  Bell,
  Shield,
  ClipboardList,
  LogOut
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePermission } from "@/contexts/PermissionContext";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface MenuItem {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  requiredArea?: string | null;
  requiredLevel?: number;
  requiredRole?: string[];
}

interface SidebarProps {
  menuItems: MenuItem[];
  currentPath: string;
  onMenuItemClick: (path: string) => void;
  onLogout: () => void;
  userRole?: string | null;
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  menuItems,
  currentPath,
  onMenuItemClick,
  onLogout,
  userRole,
  className
}) => {
  const { user } = useAuth();
  const location = useLocation();

  // Função para verificar se o link está ativo
  const isActive = (path: string) => {
    return currentPath === path;
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
                <AvatarImage src={user.email?.charAt(0).toUpperCase()} />
                <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold">{user.name || user.email}</h2>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
          ) : null}
          
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center px-2 py-2 mt-1 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-200 ${
                isActive(item.path) ? 'bg-gray-200' : ''
              }`}
              onClick={() => onMenuItemClick(item.path)}
            >
              <item.icon className="h-5 w-5" />
              <span className="ml-3">{item.name}</span>
              {item.badge && item.badge > 0 && (
                <span className="ml-auto bg-vehicleApp-red text-white text-xs font-medium rounded-full px-2 py-0.5">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
          
          <div className="mt-auto pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center" 
              onClick={onLogout}
            >
              <LogOut className="mr-2 h-5 w-5" />
              Sair
            </Button>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;


import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { 
  Car, 
  Plus, 
  Bell, 
  User, 
  Store,
  BarChart3,
  Users,
  Settings,
  ShoppingCart,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreSwitcher } from "@/components/store/StoreSwitcher";
import { AlertBadge } from "@/components/ui/alert-badge";
import { useVehicles } from "@/contexts/VehicleContext";
import { Badge } from "@/components/ui/badge";
import { usePermission } from "@/contexts/PermissionContext";
import { useMenuAlerts } from "@/hooks/useMenuAlerts";

const Layout: React.FC = () => {
  const location = useLocation();
  const { unreadNotificationsCount } = useVehicles();
  const { checkPermission } = usePermission();
  const menuAlerts = useMenuAlerts();

  const navItems = [
    { 
      path: "/inventory", 
      icon: Car, 
      label: "Estoque",
      permission: { area: "inventory" as const, level: 1 },
      alert: menuAlerts.inventory
    },
    { 
      path: "/add-vehicle", 
      icon: Plus, 
      label: "Adicionar",
      permission: { area: "add_vehicle" as const, level: 5 }
    },
    { 
      path: "/sales", 
      icon: ShoppingCart, 
      label: "Vendas",
      permission: { area: "sales" as const, level: 1 },
      alert: menuAlerts.sales
    },
    { 
      path: "/advertisements", 
      icon: BarChart3, 
      label: "Anúncios",
      permission: { area: "advertisements" as const, level: 2 },
      alert: menuAlerts.advertisements
    },
    { 
      path: "/pendings", 
      icon: AlertTriangle, 
      label: "Pendentes",
      permission: { area: "pendings" as const, level: 1 },
      alert: menuAlerts.pendings
    },
    { 
      path: "/collaborators", 
      icon: Users, 
      label: "Colaboradores"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm border-r flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-vehicleApp-red rounded-lg flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">VehicleApp</h1>
              <p className="text-sm text-gray-500">Sistema de Gestão</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b">
          <StoreSwitcher />
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              // Check permission if item has permission requirements
              if (item.permission && !checkPermission(item.permission.area, item.permission.level)) {
                return null;
              }

              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors relative ${
                      isActive
                        ? "bg-vehicleApp-red text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                    {item.alert && (
                      <AlertBadge 
                        count={item.alert.count}
                        severity={item.alert.severity}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t space-y-2">
          <Link to="/notifications">
            <Button 
              variant="ghost" 
              className="w-full justify-start relative"
            >
              <Bell className="w-4 h-4 mr-2" />
              Notificações
              {unreadNotificationsCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="ml-auto text-xs px-2 py-1"
                >
                  {unreadNotificationsCount}
                </Badge>
              )}
            </Button>
          </Link>
          <Link to="/profile">
            <Button variant="ghost" className="w-full justify-start">
              <User className="w-4 h-4 mr-2" />
              Perfil
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export { Layout };

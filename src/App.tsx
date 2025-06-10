
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PermissionProvider, usePermission } from "./contexts/PermissionContext";
import { StoreProvider } from "./contexts/StoreContext";
import { VehicleProvider } from "./contexts/VehicleContext";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import AddVehicle from "./pages/AddVehicle";
import VehicleDetails from "./pages/VehicleDetails";
import EditVehicle from "./pages/EditVehicle";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Advertisements from "./pages/Advertisements";
import Collaborators from "./pages/Collaborators";
import Sales from "./pages/Sales";
import Pendings from "./pages/Pendings";
import AdminPermissions from "./pages/AdminPermissions";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedArea from "./components/ProtectedArea";
import { permissionRules } from "@/utils/permissionRules";
import { checkPermission } from "./services/permissionService";

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Retry até 2 vezes, exceto para erros de autenticação
        if (error?.code === 'PGRST301' || error?.message?.includes('JWT')) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000, // 5 minutos
    },
  },
});

function AppRoutes() {
  const { userRole, roleLevel } = usePermission();
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/inventory" replace /> : <Login />
      } />
      <Route path="/" element={<Navigate to="/inventory" replace />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        {permissionRules.inventory && (
          <Route path="inventory" element={
            <ProtectedArea 
              area="inventory" 
              requiredLevel={1}
              fallback={<div className="p-8 text-center">Você não tem permissão para acessar o estoque.</div>}
            >
              <Inventory />
            </ProtectedArea>
          } />
        )}
        {permissionRules.add_vehicle && (
          <Route path="add-vehicle" element={
            <ProtectedArea 
              area="add_vehicle" 
              requiredLevel={5}
              fallback={<div className="p-8 text-center">Somente Gerentes e Administradores podem adicionar veículos.</div>}
            >
              <AddVehicle />
            </ProtectedArea>
          } />
        )}
        {permissionRules.vehicle_details && (
          <Route path="vehicle/:id" element={
            <ProtectedArea 
              area="vehicle_details" 
              requiredLevel={1}
              fallback={<div className="p-8 text-center">Você não tem permissão para visualizar detalhes de veículos.</div>}
            >
              <VehicleDetails />
            </ProtectedArea>
          } />
        )}
        {permissionRules["edit_vehicle"] && (
          <Route path="edit-vehicle/:id" element={
            <ProtectedArea 
              area="inventory" 
              requiredLevel={2}
              fallback={<div className="p-8 text-center">Você não tem permissão para editar veículos.</div>}
            >
              <EditVehicle />
            </ProtectedArea>
          } />
        )}
        {permissionRules.sales && (
          <Route path="sales" element={
            <ProtectedArea 
              area="sales" 
              requiredLevel={1}
              fallback={<div className="p-8 text-center">Você não tem permissão para acessar vendas.</div>}
            >
              <Sales />
            </ProtectedArea>
          } />
        )}
        {permissionRules.advertisements && (
          <Route path="advertisements" element={
            <ProtectedArea 
              area="advertisements" 
              requiredLevel={2}
              fallback={<div className="p-8 text-center">Você não tem permissão para gerenciar anúncios.</div>}
            >
              <Advertisements />
            </ProtectedArea>
          } />
        )}
        {permissionRules.pendings && checkPermission('pendings', userRole, roleLevel).hasAccess && (
          <Route path="pendings" element={
            <ProtectedArea 
              area="pendings" 
              requiredLevel={1}
              fallback={<div className="p-8 text-center">Você não tem permissão para acessar os pendentes.</div>}
            >
              <Pendings />
            </ProtectedArea>
          } />
        )}
        {permissionRules.admin_panel && (
          <Route path="admin/permissions" element={
            <ProtectedArea 
              area="admin_panel" 
              requiredLevel={10}
              fallback={<div className="p-8 text-center">Apenas Administradores podem acessar o painel de controle.</div>}
            >
              <AdminPermissions />
            </ProtectedArea>
          } />
        )}
        <Route path="collaborators" element={<Collaborators />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AuthProvider>
              <PermissionProvider>
                <StoreProvider>
                  <VehicleProvider>
                    <AppRoutes />
                  </VehicleProvider>
                </StoreProvider>
              </PermissionProvider>
            </AuthProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

export default App;

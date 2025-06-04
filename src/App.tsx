
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PermissionProvider } from "./contexts/PermissionContext";
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
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedArea from "./components/ProtectedArea";

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

const App = () => (
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
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<Navigate to="/inventory" replace />} />
                    
                    <Route path="/" element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }>
                      <Route path="inventory" element={
                        <ProtectedArea 
                          area="inventory" 
                          requiredLevel={1}
                          fallback={<div className="p-8 text-center">Você não tem permissão para acessar o estoque.</div>}
                        >
                          <Inventory />
                        </ProtectedArea>
                      } />
                      
                      <Route path="add-vehicle" element={
                        <ProtectedArea 
                          area="add_vehicle" 
                          requiredLevel={5}
                          fallback={<div className="p-8 text-center">Somente Gerentes e Administradores podem adicionar veículos.</div>}
                        >
                          <AddVehicle />
                        </ProtectedArea>
                      } />
                      
                      <Route path="vehicle/:id" element={
                        <ProtectedArea 
                          area="vehicle_details" 
                          requiredLevel={1}
                          fallback={<div className="p-8 text-center">Você não tem permissão para visualizar detalhes de veículos.</div>}
                        >
                          <VehicleDetails />
                        </ProtectedArea>
                      } />
                      
                      <Route path="edit-vehicle/:id" element={
                        <ProtectedArea 
                          area="inventory" 
                          requiredLevel={2}
                          fallback={<div className="p-8 text-center">Você não tem permissão para editar veículos.</div>}
                        >
                          <EditVehicle />
                        </ProtectedArea>
                      } />
                      
                      <Route path="sales" element={
                        <ProtectedArea 
                          area="inventory" 
                          requiredLevel={1}
                          fallback={<div className="p-8 text-center">Você não tem permissão para acessar vendas.</div>}
                        >
                          <Sales />
                        </ProtectedArea>
                      } />
                      
                      <Route path="advertisements" element={
                        <ProtectedArea 
                          area="inventory" 
                          requiredLevel={2}
                          fallback={<div className="p-8 text-center">Você não tem permissão para gerenciar anúncios.</div>}
                        >
                          <Advertisements />
                        </ProtectedArea>
                      } />
                      
                      <Route path="collaborators" element={<Collaborators />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                    
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </VehicleProvider>
              </StoreProvider>
            </PermissionProvider>
          </AuthProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

export default App;

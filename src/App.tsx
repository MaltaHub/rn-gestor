import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PermissionProvider } from "./contexts/PermissionContext";
import { FeaturePermissionsProvider } from "./contexts/FeaturePermissionsContext";
import { VehicleProvider } from "./contexts/VehicleContext";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import AddVehicle from "./pages/AddVehicle";
import VehicleDetails from "./pages/VehicleDetails";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Collaborators from "./pages/Collaborators";
import CollaboratorDetails from "./pages/CollaboratorDetails";
import RoleManagement from "./pages/RoleManagement";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedArea from "./components/ProtectedArea";
import CompleteProfile from "./pages/CompleteProfile";
import Tasks from "./pages/Tasks";

// Create a query client instance with appropriate default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

// Rotas da aplicação
const appRoutes = [
  { path: "/login", element: <Login /> },
  { path: "/complete-profile", element: <ProtectedRoute requireCompleteProfile={false}><CompleteProfile /></ProtectedRoute> },
  { path: "/", element: <Navigate to="/inventory" replace /> },
  { path: "/", element: <ProtectedRoute><Layout /></ProtectedRoute> },
  { path: "inventory", element: <ProtectedArea area="inventory" requiredLevel={1} fallback={<div className="p-8 text-center">Você não tem permissão para acessar o estoque.</div>}> <Inventory /> </ProtectedArea> },
  { path: "add-vehicle", element: <ProtectedArea area="add_vehicle" requiredLevel={5} fallback={<div className="p-8 text-center">Somente Gerentes e Administradores podem adicionar veículos.</div>}> <AddVehicle /> </ProtectedArea> },
  { path: "vehicle/:id", element: <ProtectedArea area="vehicle_details" requiredLevel={1} fallback={<div className="p-8 text-center">Você não tem permissão para visualizar detalhes de veículos.</div>}> <VehicleDetails /> </ProtectedArea> },
  { path: "notifications", element: <Notifications /> },
  { path: "profile", element: <Profile /> },
  { path: "collaborators", element: <Collaborators /> },
  { path: "collaborator/:id", element: <CollaboratorDetails /> },
  { path: "roles", element: <RoleManagement /> },
  { path: "tasks", element: <ProtectedRoute><Tasks /></ProtectedRoute> },
  { path: "*", element: <NotFound /> },
];

const App = () => (
  <BrowserRouter>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <PermissionProvider>
              <FeaturePermissionsProvider>
                <VehicleProvider>
                  <Routes>
                    {appRoutes.map((route, index) => (
                      <Route key={index} {...route} />
                    ))}
                  </Routes>
                </VehicleProvider>
              </FeaturePermissionsProvider>
            </PermissionProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>
  </BrowserRouter>
);

export default App;

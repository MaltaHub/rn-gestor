
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { VehicleProvider } from "./contexts/VehicleContext";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import AddVehicle from "./pages/AddVehicle";
import VehicleDetails from "./pages/VehicleDetails";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <VehicleProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/inventory" replace />} />
              
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="inventory" element={<Inventory />} />
                <Route path="add-vehicle" element={<AddVehicle />} />
                <Route path="vehicle/:id" element={<VehicleDetails />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<Profile />} />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </VehicleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

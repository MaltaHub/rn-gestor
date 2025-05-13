
// App.tsx
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import { Toaster as ToastToaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "./contexts/AuthContext";
import { PermissionProvider } from "./contexts/PermissionContext";
import { FeaturePermissionsProvider } from "./contexts/FeaturePermissionsContext";
import { VehicleProvider } from "./contexts/VehicleContext";

import AppRoutes from "./AppRoutes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const App = () => (
  <BrowserRouter>
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastToaster />
          <SonnerToaster />
          <AuthProvider>
            <PermissionProvider>
              <FeaturePermissionsProvider>
                <VehicleProvider>
                  <AppRoutes />
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

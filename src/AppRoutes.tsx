
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { Layout } from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedArea from "./components/ProtectedArea";

import Login from "./pages/Login";
import CompleteProfile from "./pages/CompleteProfile";
import Inventory from "./pages/Inventory";
import AddVehicle from "./pages/AddVehicle";
import VehicleDetails from "./pages/VehicleDetails";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Collaborators from "./pages/Collaborators";
import CollaboratorDetails from "./pages/CollaboratorDetails";
import RoleManagement from "./pages/RoleManagement";
import NotFound from "./pages/NotFound";
import { VehicleProvider } from "./contexts/VehicleContext";

const NoPermission = ({ message }: { message: string }) => (
  <div className="p-8 text-center">{message}</div>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route
      path="/complete-profile"
      element={
        <ProtectedRoute requireCompleteProfile={false}>
          <CompleteProfile />
        </ProtectedRoute>
      }
    />
    <Route path="/" element={<Navigate to="/inventory" replace />} />

    <Route
      path="/"
      element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }
    >
      <Route path="inventory" element={<Inventory />} />

      <Route
        path="add-vehicle"
        element={
          <ProtectedArea
            area="add_vehicle"
            requiredLevel={5}
            fallback={<NoPermission message="Somente Gerentes e Administradores podem adicionar veículos." />}
          >
            <AddVehicle />
          </ProtectedArea>
        }
      />

      <Route
        path="vehicle/:id"
        element={
          <ProtectedArea
            area="vehicle_details"
            requiredLevel={1}
            fallback={<NoPermission message="Você não tem permissão para visualizar detalhes de veículos." />}
          >
            <VehicleDetails />
          </ProtectedArea>
        }
      />

      <Route path="notifications" element={<Notifications />} />
      <Route path="profile" element={<Profile />} />
      <Route path="collaborators" element={<Collaborators />} />
      <Route path="collaborator/:id" element={<CollaboratorDetails />} />
      <Route path="roles" element={<RoleManagement />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default AppRoutes;


import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { Layout } from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import CompleteProfile from "./pages/CompleteProfile";
import Inventory from "./pages/Inventory";
import AddVehicle from "./pages/AddVehicle";
import VehicleDetails from "./pages/VehicleDetails";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Collaborators from "./pages/Collaborators";
import CollaboratorDetails from "./pages/CollaboratorDetails";
import NotFound from "./pages/NotFound";
import { VehicleProvider } from "./contexts/VehicleContext";

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
      <Route path="add-vehicle" element={<AddVehicle />} />
      <Route path="vehicle/:id" element={<VehicleDetails />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="profile" element={<Profile />} />
      <Route path="collaborators" element={<Collaborators />} />
      <Route path="collaborator/:id" element={<CollaboratorDetails />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default AppRoutes;

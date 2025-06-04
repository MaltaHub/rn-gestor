
import React from "react";
import Collaborators from "@/pages/Collaborators";
import ProtectedRoute from "@/components/ProtectedRoute";

export const CollaboratorsRoute = () => (
  <ProtectedRoute>
    <Collaborators />
  </ProtectedRoute>
);

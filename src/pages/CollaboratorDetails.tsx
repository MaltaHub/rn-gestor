
import React from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useCollaborator } from "@/hooks/useCollaborator";
import { Loader2 } from "lucide-react";
import { CollaboratorNotFound } from "@/components/collaborator/CollaboratorNotFound";
import { CollaboratorProfile } from "@/components/collaborator/CollaboratorProfile";
import { CollaboratorHeader } from "@/components/collaborator/CollaboratorHeader";
import { CollaboratorHistory } from "@/components/collaborator/CollaboratorHistory";

const CollaboratorDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { collaborator, isLoading, error } = useCollaborator(id || "");

  // Show loading state
  if (isLoading) {
    return (
      <div className="content-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-vehicleApp-red" />
          <p className="mt-4 text-vehicleApp-mediumGray">Carregando dados do colaborador...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !collaborator) {
    return <CollaboratorNotFound />;
  }

  return (
    <div className="content-container py-6 space-y-6">
      {/* Back button and header */}
      <div className="flex items-center mb-4">
        <Button
          as={Link}
          to="/collaborators"
          variant="outline"
          size="icon"
          className="h-8 w-8 mr-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Detalhes do Colaborador</h1>
      </div>

      {/* Collaborator Header */}
      <CollaboratorHeader
        collaborator={collaborator}
      />

      {/* Collaborator Profile */}
      <CollaboratorProfile 
        collaborator={collaborator}
      />

      {/* Collaborator Activity History */}
      <CollaboratorHistory collaboratorId={collaborator.id} />
    </div>
  );
};

export default CollaboratorDetailsPage;

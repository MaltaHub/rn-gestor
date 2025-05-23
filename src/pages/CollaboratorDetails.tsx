
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCollaborator } from "@/hooks/useCollaborator";
import { CollaboratorProfile } from "@/components/collaborator/CollaboratorProfile";
import { CollaboratorNotFound } from "@/components/collaborator/CollaboratorNotFound";
import { CollaboratorHeader } from "@/components/collaborator/CollaboratorHeader";
import { CollaboratorLoader } from "@/components/collaborator/CollaboratorLoader";

const CollaboratorDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { collaborator, isLoading } = useCollaborator(id || "");
  
  if (isLoading) {
    return <CollaboratorLoader />;
  }
  
  if (!collaborator) {
    return <CollaboratorNotFound />;
  }
  
  return (
    <div className="content-container py-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <Link to="/collaborators">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold flex items-center">
            <User className="mr-2 h-6 w-6 text-vehicleApp-red" />
            Detalhes do Colaborador
          </h1>
        </div>
      </div>
      
      <CollaboratorHeader collaborator={collaborator} />
      <CollaboratorProfile collaborator={collaborator} />
    </div>
  );
};

export default CollaboratorDetailsPage;

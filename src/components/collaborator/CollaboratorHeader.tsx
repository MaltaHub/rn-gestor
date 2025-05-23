
import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collaborator } from "@/hooks/useCollaborators";

interface CollaboratorHeaderProps {
  collaborator: Collaborator;
}

export const CollaboratorHeader: React.FC<CollaboratorHeaderProps> = ({ collaborator }) => {
  const navigate = useNavigate();
  
  return (
    <div className="mb-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/collaborators')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar aos Colaboradores
        </Button>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl">
            {collaborator.name || "Colaborador"}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
};


import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCollaborator } from "@/hooks/useCollaborator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { CollaboratorHistory } from "@/components/collaborator/CollaboratorHistory";
import { usePermission } from "@/contexts/PermissionContext";
import { CollaboratorLoader } from "@/components/collaborator/CollaboratorLoader";
import { CollaboratorNotFound } from "@/components/collaborator/CollaboratorNotFound";
import { CollaboratorHeader } from "@/components/collaborator/CollaboratorHeader";
import { CollaboratorProfile } from "@/components/collaborator/CollaboratorProfile";
import { UserRoleType } from "@/types/permission";

const CollaboratorDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { collaborator, isLoading } = useCollaborator(id || "");
  const navigate = useNavigate();
  const { userRole } = usePermission();
  
  // Cast userRole to UserRoleType since we know it will be one of the valid roles
  const typedUserRole = userRole as UserRoleType;
  
  // Check if the current user is a manager (Gerente or Administrador)
  const isManager = typedUserRole === 'Gerente' || typedUserRole === 'Administrador';
  const isAdmin = typedUserRole === 'Administrador';
  
  if (isLoading) {
    return <CollaboratorLoader />;
  }
  
  if (!collaborator) {
    return <CollaboratorNotFound />;
  }

  return (
    <div className="content-container py-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/collaborators')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Equipe
        </Button>
      </div>
      
      <Card>
        <CollaboratorHeader collaborator={collaborator} />
        
        <Tabs defaultValue="profile" className="px-6 pb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="profile">Perfil</TabsTrigger>
            {isManager && id && <TabsTrigger value="history">Histórico</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="profile">
            <CollaboratorProfile 
              collaborator={collaborator}
              userRole={typedUserRole}
              isManager={isManager}
              isAdmin={isAdmin}
            />
          </TabsContent>
          
          {isManager && id && (
            <TabsContent value="history">
              <div className="px-6 pb-6">
                <CollaboratorHistory collaboratorId={id} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default CollaboratorDetailsPage;

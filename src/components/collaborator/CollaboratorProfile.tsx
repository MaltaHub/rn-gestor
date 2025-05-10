
import React from "react";
import { format } from "date-fns";
import { Collaborator } from "@/hooks/useCollaborators";
import { UserRoleType } from "@/types/permission";
import { CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar, Briefcase, FileText } from "lucide-react";
import { CollaboratorRoleManager } from "./CollaboratorRoleManager";

interface CollaboratorProfileProps {
  collaborator: Collaborator;
  userRole: UserRoleType;
  isManager: boolean;
  isAdmin: boolean;
}

export const CollaboratorProfile: React.FC<CollaboratorProfileProps> = ({
  collaborator,
  userRole,
  isManager,
  isAdmin
}) => {
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy');
  };
  
  return (
    <CardContent className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-vehicleApp-red h-5 w-5" />
            <div>
              <p className="text-sm text-vehicleApp-mediumGray">Data de Início</p>
              <p className="font-medium">
                {collaborator.joinDate ? formatDate(collaborator.joinDate) : "N/A"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Briefcase className="text-vehicleApp-red h-5 w-5" />
            <CollaboratorRoleManager
              collaborator={collaborator}
              userRole={userRole}
              isManager={isManager}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </div>
      
      <Separator />
      
      <div>
        <div className="flex items-center gap-3 mb-2">
          <FileText className="text-vehicleApp-red h-5 w-5" />
          <p className="font-medium">Bio</p>
        </div>
        <p className="text-vehicleApp-darkGray pl-8">
          {collaborator.bio || "Nenhuma biografia disponível."}
        </p>
      </div>
    </CardContent>
  );
};

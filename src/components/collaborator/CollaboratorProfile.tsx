
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collaborator } from "@/hooks/useCollaborators";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/utils/dateUtils";

interface CollaboratorProfileProps {
  collaborator: Collaborator;
}

export const CollaboratorProfile: React.FC<CollaboratorProfileProps> = ({ collaborator }) => {
  // Format collaborator name initials for avatar fallback
  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-shrink-0">
            <Avatar className="h-24 w-24">
              <AvatarImage src={collaborator.avatarUrl || undefined} />
              <AvatarFallback className="text-lg">
                {getInitials(collaborator.name)}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-4 flex-grow">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold">Informações Básicas</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-sm text-vehicleApp-mediumGray">Nome</p>
                  <p className="font-medium">{collaborator.name}</p>
                </div>
                <div>
                  <p className="text-sm text-vehicleApp-mediumGray">E-mail</p>
                  <p className="font-medium">{collaborator.email}</p>
                </div>
                <div>
                  <p className="text-sm text-vehicleApp-mediumGray">Data de Nascimento</p>
                  <p className="font-medium">
                    {collaborator.birthdate ? formatDate(collaborator.birthdate) : "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-vehicleApp-mediumGray">Ingressou em</p>
                  <p className="font-medium">
                    {collaborator.joinDate ? formatDate(collaborator.joinDate) : "Não informado"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bio/About */}
            {collaborator.bio && (
              <div>
                <h3 className="text-lg font-semibold">Sobre</h3>
                <p className="mt-2 text-vehicleApp-black whitespace-pre-line">{collaborator.bio}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

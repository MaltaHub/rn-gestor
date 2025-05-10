
import React from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collaborator } from "@/hooks/useCollaborators";

interface CollaboratorHeaderProps {
  collaborator: Collaborator;
}

export const CollaboratorHeader: React.FC<CollaboratorHeaderProps> = ({ collaborator }) => {
  // Generate avatar fallback from name
  const getInitials = (name: string) => {
    return name.split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };
  
  return (
    <CardHeader>
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {collaborator.avatarUrl ? (
            <AvatarImage src={collaborator.avatarUrl} alt={collaborator.name} />
          ) : null}
          <AvatarFallback className="text-lg bg-vehicleApp-lightRed text-vehicleApp-red">
            {getInitials(collaborator.name)}
          </AvatarFallback>
        </Avatar>
        
        <div>
          <CardTitle className="text-2xl">{collaborator.name}</CardTitle>
          <p className="text-vehicleApp-mediumGray">
            {collaborator.role}
          </p>
        </div>
      </div>
    </CardHeader>
  );
};

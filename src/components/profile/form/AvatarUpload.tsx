
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AvatarUploadProps {
  avatarUrl: string | null;
  name: string | null;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({ avatarUrl, name }) => {
  const getInitials = (name: string | null): string => {
    if (!name) return "?";
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback className="text-lg">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div>
        <h3 className="text-lg font-semibold">{name || "Usuário"}</h3>
      </div>
    </div>
  );
};

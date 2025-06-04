
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  alt = "Avatar do usuário",
  fallback,
  className
}) => {
  // Gerar iniciais como fallback se não fornecido
  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = fallback || getInitials(alt);

  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback className="bg-vehicleApp-red text-white font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};


import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfileField } from "./ProfileField";
import { useRoles } from "@/hooks/permission/useRoles";
import { Loader2 } from "lucide-react";

interface RoleFieldProps {
  role: string | null;
}

export const RoleField: React.FC<RoleFieldProps> = ({ role }) => {
  const { roles, isLoading } = useRoles();

  return (
    <ProfileField 
      id="role" 
      label="Função" 
      helpText="Somente o Gerente pode alterar a sua função."
    >
      <Select disabled value={role || undefined}>
        <SelectTrigger id="role">
          <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione uma função"} />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Carregando cargos...</span>
            </div>
          ) : (
            roles.map((roleOption) => (
              <SelectItem key={roleOption} value={roleOption}>
                {roleOption}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {isLoading && (
        <div className="text-xs text-gray-500 mt-1 flex items-center">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Carregando cargos...
        </div>
      )}
    </ProfileField>
  );
};

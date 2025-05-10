
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfileField } from "./ProfileField";

interface RoleFieldProps {
  role: string | null;
}

export const RoleField: React.FC<RoleFieldProps> = ({ role }) => {
  return (
    <ProfileField 
      id="role" 
      label="Função" 
      helpText="Somente o Gerente pode alterar a sua função."
    >
      <Select disabled value={role || undefined}>
        <SelectTrigger id="role">
          <SelectValue placeholder="Selecione uma função" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Vendedor">Vendedor</SelectItem>
          <SelectItem value="Gerente">Gerente</SelectItem>
          <SelectItem value="Administrador">Administrador</SelectItem>
        </SelectContent>
      </Select>
    </ProfileField>
  );
};


import React, { useState } from "react";
import { UserRoleType } from "@/types/permission";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Collaborator } from "@/hooks/useCollaborators";

interface CollaboratorRoleManagerProps {
  collaborator: Collaborator;
  userRole: UserRoleType;
  isManager: boolean;
  isAdmin: boolean;
}

export const CollaboratorRoleManager: React.FC<CollaboratorRoleManagerProps> = ({
  collaborator,
  userRole,
  isManager,
  isAdmin,
}) => {
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  
  const handleRoleChange = async (newRole: UserRoleType) => {
    if (!collaborator.id || !isManager) return;
    
    try {
      setIsUpdatingRole(true);
      
      // Administradores não podem ser alterados por ninguém
      if (collaborator.role === 'Administrador') {
        toast.error("Não é possível alterar o cargo de um Administrador");
        return;
      }
      
      // Gerentes só podem ser alterados por Administradores
      if (collaborator.role === 'Gerente' && userRole !== 'Administrador') {
        toast.error("Apenas Administradores podem alterar o cargo de um Gerente");
        return;
      }
      
      // Gerente não pode promover alguém para Administrador
      if (newRole === 'Administrador' && userRole !== 'Administrador') {
        toast.error("Apenas Administradores podem definir o cargo de Administrador");
        return;
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', collaborator.id);
      
      if (error) {
        console.error("Erro ao atualizar cargo:", error);
        toast.error("Erro ao atualizar cargo do colaborador");
        return;
      }
      
      toast.success(`Cargo atualizado para ${newRole}`);
      
      // Reload page to refresh data
      window.location.reload();
    } catch (err) {
      console.error("Erro ao atualizar cargo:", err);
      toast.error("Erro ao atualizar cargo do colaborador");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  return (
    <div className="w-full">
      <p className="text-sm text-vehicleApp-mediumGray">Cargo</p>
      
      {isManager ? (
        <div className="mt-1 max-w-xs">
          <Select 
            value={collaborator.role as UserRoleType}
            onValueChange={(value: UserRoleType) => handleRoleChange(value)}
            disabled={
              isUpdatingRole || 
              (collaborator.role === 'Administrador') || 
              (collaborator.role === 'Gerente' && !isAdmin) ||
              (!isAdmin && collaborator.role === 'Vendedor' && collaborator.role === 'Vendedor')
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={collaborator.role || ''} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vendedor">Vendedor</SelectItem>
              {isAdmin && <SelectItem value="Gerente">Gerente</SelectItem>}
              {isAdmin && <SelectItem value="Administrador">Administrador</SelectItem>}
            </SelectContent>
          </Select>
          {isUpdatingRole && (
            <div className="flex items-center mt-2 text-sm text-vehicleApp-mediumGray">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Atualizando...
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {isAdmin 
              ? "Administradores podem alterar qualquer cargo."
              : "Gerentes só podem alterar cargos de Vendedores."}
          </p>
        </div>
      ) : (
        <p className="font-medium">{collaborator.role}</p>
      )}
    </div>
  );
};

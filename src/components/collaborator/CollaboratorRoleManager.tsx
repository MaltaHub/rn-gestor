
import React, { useState } from "react";
import { UserRoleType } from "@/types/permission";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Collaborator } from "@/hooks/useCollaborators";
import { toUserRole } from "@/utils/permission/types";
import { useRoleManagement } from "@/hooks/permission/useRoleManagement";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [isPromotingToAdmin, setIsPromotingToAdmin] = useState(false);
  const [pendingRole, setPendingRole] = useState<UserRoleType | null>(null);
  
  // Use our new role management hook
  const { changeUserRole, isProcessing } = useRoleManagement(userRole);
  
  const handleRoleChange = async (newRole: UserRoleType) => {
    if (!collaborator.id || !isManager) return;
    
    // If promoting to Admin, show confirmation dialog
    if (newRole === 'Administrador' && isAdmin) {
      setPendingRole(newRole);
      setIsPromotingToAdmin(true);
      return;
    }
    
    const success = await changeUserRole(
      collaborator.id, 
      newRole, 
      collaborator.role as UserRoleType
    );
    
    if (success) {
      // Reload page to refresh data
      window.location.reload();
    }
  };
  
  const confirmAdminPromotion = async () => {
    if (!pendingRole || !collaborator.id) return;
    
    const success = await changeUserRole(
      collaborator.id, 
      pendingRole, 
      collaborator.role as UserRoleType
    );
    
    setIsPromotingToAdmin(false);
    setPendingRole(null);
    
    if (success) {
      // Reload page to refresh data
      window.location.reload();
    }
  };

  // Ensure we have a valid UserRoleType for the current collaborator role
  const collaboratorRole = toUserRole(collaborator.role) || 'Usuário' as UserRoleType;
  
  // Determine if role change is disabled
  const isRoleChangeDisabled = 
    isProcessing || 
    collaborator.role === 'Administrador' || 
    (collaborator.role === 'Gerente' && !isAdmin) ||
    (!isAdmin && collaborator.role === 'Gerente');

  return (
    <div className="w-full">
      <p className="text-sm text-vehicleApp-mediumGray">Cargo</p>
      
      {isManager ? (
        <div className="mt-1 max-w-xs">
          <Select 
            value={collaboratorRole}
            onValueChange={(value: UserRoleType) => handleRoleChange(value)}
            disabled={isRoleChangeDisabled}
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
          {isProcessing && (
            <div className="flex items-center mt-2 text-sm text-vehicleApp-mediumGray">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Atualizando...
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {isAdmin 
              ? "Administradores podem alterar qualquer cargo, exceto de outros Administradores."
              : "Gerentes só podem alterar cargos de Vendedores."}
          </p>
        </div>
      ) : (
        <p className="font-medium">{collaborator.role}</p>
      )}
      
      {/* Confirmation dialog for promoting to Administrator */}
      <AlertDialog open={isPromotingToAdmin} onOpenChange={setIsPromotingToAdmin}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar promoção para Administrador</AlertDialogTitle>
            <AlertDialogDescription>
              Ao promover este colaborador para Administrador, o administrador atual será
              rebaixado para Vendedor. Esta operação não pode ser desfeita facilmente.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAdminPromotion}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

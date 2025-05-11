
import React from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { canDeleteRole, canEditRole } from '@/services/permission/roleManagementService';
import { Database } from '@/integrations/supabase/types';
import { AppArea } from '@/types/permission';

type UserRole = Database['public']['Enums']['user_role'];

type GroupedPermissions = {
  [key in UserRole]?: {
    inventory: number;
    vehicle_details: number;
    add_vehicle: number;
  };
};

interface RoleTableProps {
  groupedPermissions: GroupedPermissions;
  userRole: string | null;
  onEditRole: (role: UserRole) => void;
  onDeleteRole: (role: UserRole) => void;
}

const RoleTable: React.FC<RoleTableProps> = ({
  groupedPermissions,
  userRole,
  onEditRole,
  onDeleteRole,
}) => {
  const isAdmin = userRole === 'Administrador';

  const checkCanEditRole = (role: UserRole): boolean => {
    return canEditRole(role, userRole || '');
  };

  const checkCanDeleteRole = (role: UserRole): boolean => {
    return canDeleteRole(role, userRole || '');
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Cargo</TableHead>
            <TableHead>Estoque (inventory)</TableHead>
            <TableHead>Detalhes do Veículo (vehicle_details)</TableHead>
            <TableHead>Adicionar Veículo (add_vehicle)</TableHead>
            {isAdmin && (
              <TableHead className="text-right">Ações</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(groupedPermissions).map(([role, permissions]) => (
            <TableRow key={role}>
              <TableCell className="font-medium">{role}</TableCell>
              <TableCell>{permissions.inventory}</TableCell>
              <TableCell>{permissions.vehicle_details}</TableCell>
              <TableCell>{permissions.add_vehicle}</TableCell>
              {isAdmin && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={!checkCanEditRole(role as UserRole)}
                      onClick={() => onEditRole(role as UserRole)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={!checkCanDeleteRole(role as UserRole)}
                      onClick={() => onDeleteRole(role as UserRole)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default RoleTable;

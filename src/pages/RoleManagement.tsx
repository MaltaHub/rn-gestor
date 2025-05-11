import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/contexts/PermissionContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database } from '@/integrations/supabase/types';
import { z } from 'zod';
import { AppArea, UserRoleType } from '@/types/permission';
import { toUserRole } from '@/utils/permission/types';
import { getUserRolesWithPermissions } from '@/services/permission/roleManagementService';

// Import refactored components
import RoleTable from '@/components/role-management/RoleTable';
import AddRoleDialog, { roleSchema } from '@/components/role-management/AddRoleDialog';
import EditPermissionsDialog from '@/components/role-management/EditPermissionsDialog';
import DeleteRoleDialog from '@/components/role-management/DeleteRoleDialog';
import AdminWarningDialog from '@/components/role-management/AdminWarningDialog';
import AccessRestrictedCard from '@/components/role-management/AccessRestrictedCard';
import ManagerAlert from '@/components/role-management/ManagerAlert';

// Type for role permissions from database
type UserRole = Database['public']['Enums']['user_role'];
type RolePermission = {
  id: string;
  role: UserRole;
  area: AppArea;
  permission_level: number;
};

// Type for grouped permissions by role
type GroupedPermissions = {
  [key in UserRole]?: {
    inventory: number;
    vehicle_details: number;
    add_vehicle: number;
  };
};

// Form schema for permission level validation
const permissionSchema = z.object({
  inventory: z.coerce.number().min(0).max(10),
  vehicle_details: z.coerce.number().min(0).max(10),
  add_vehicle: z.coerce.number().min(0).max(10),
});

const RoleManagement = () => {
  const { userRole } = usePermission();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAdminWarningOpen, setIsAdminWarningOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [groupedPermissions, setGroupedPermissions] = useState<GroupedPermissions>({});

  const isAdmin = userRole === 'Administrador';

  // Fetch role permissions
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['rolePermissions'],
    queryFn: async () => {
      try {
        return await getUserRolesWithPermissions();
      } catch (error) {
        toast.error('Erro ao carregar permissões');
        throw error;
      }
    },
  });

  // Group permissions by role
  useEffect(() => {
    if (permissions) {
      const grouped: GroupedPermissions = {};
      
      permissions.forEach(perm => {
        if (!grouped[perm.role]) {
          grouped[perm.role] = {
            inventory: 0,
            vehicle_details: 0,
            add_vehicle: 0,
          };
        }
        
        grouped[perm.role][perm.area] = perm.permission_level;
      });
      
      setGroupedPermissions(grouped);
    }
  }, [permissions]);

  // Add new role mutation
  const addRoleMutation = useMutation({
    mutationFn: async (roleName: UserRoleType) => {
      // First check if role already exists
      const { data: existingRoles, error: checkError } = await supabase
        .from('role_permissions')
        .select('role')
        .eq('role', roleName);

      if (checkError) {
        throw checkError;
      }

      if (existingRoles && existingRoles.length > 0) {
        throw new Error('Este cargo já existe');
      }
      
      // Rule: Admins can't create Gerente roles
      if (roleName === 'Gerente') {
        throw new Error('O cargo de Gerente não pode ser criado');
      }
      
      // Rule: Only one admin allowed
      if (roleName === 'Administrador') {
        // Check if an Admin already exists
        const { data: adminExists, error: adminError } = await supabase
          .from('role_permissions')
          .select('role')
          .eq('role', 'Administrador');
          
        if (adminError) {
          throw adminError;
        }
        
        if (adminExists && adminExists.length > 0) {
          throw new Error('Já existe um cargo de Administrador. Apenas um é permitido.');
        }
      }

      // Create default permissions for the new role
      const areas: AppArea[] = ['inventory', 'vehicle_details', 'add_vehicle'];
      const defaultPermissions = areas.map(area => ({
        role: roleName,
        area,
        permission_level: area === 'inventory' ? 1 : 0
      }));

      const { error } = await supabase
        .from('role_permissions')
        .insert(defaultPermissions);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Cargo adicionado com sucesso');
      setIsAddDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['rolePermissions'] });
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar cargo: ${error.message}`);
    }
  });

  // Update role permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ role, permissions }: { 
      role: UserRole, 
      permissions: { inventory: number, vehicle_details: number, add_vehicle: number } 
    }) => {
      // Validate permissions based on user role
      if (!user) throw new Error('Usuário não autenticado');
      
      // Rule: Only Administradores can edit permissions
      const userIsAdmin = userRole === 'Administrador';
      
      if (!userIsAdmin) {
        throw new Error('Apenas Administradores podem modificar permissões');
      }
      
      // Rule: Gerente permissions can't be modified
      if (role === 'Gerente') {
        throw new Error('As permissões do cargo Gerente não podem ser modificadas');
      }
      
      // Additional server-side validation
      const { data: userProfileData, error: userError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (userError || !userProfileData) {
        throw new Error('Erro ao verificar permissões do usuário');
      }
      
      const serverUserRole = userProfileData.role;
      
      // Server-side validation rules
      if (serverUserRole !== 'Administrador') {
        throw new Error('Somente Administradores podem modificar permissões');
      }
      
      // Update permissions for each area
      for (const area of ['inventory', 'vehicle_details', 'add_vehicle'] as AppArea[]) {
        const { error } = await supabase
          .from('role_permissions')
          .update({ permission_level: permissions[area] })
          .eq('role', role)
          .eq('area', area);
          
        if (error) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success('Permissões atualizadas com sucesso');
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['rolePermissions'] });
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar permissões: ${error.message}`);
    }
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (role: UserRole) => {
      // Additional server-side validation
      if (!user) throw new Error('Usuário não autenticado');
      
      // Rule: Only Administradores can delete roles
      if (userRole !== 'Administrador') {
        throw new Error('Somente Administradores podem excluir cargos');
      }
      
      // Rule: Gerente role can't be deleted
      if (role === 'Gerente') {
        throw new Error('O cargo Gerente não pode ser excluído');
      }
      
      // Rule: Administrador role can't be deleted if there are users with that role
      if (role === 'Administrador') {
        const { data: adminUsers, error: countError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('role', 'Administrador');
          
        if (countError) {
          throw countError;
        }
        
        if (adminUsers && adminUsers.length > 0) {
          throw new Error('O cargo Administrador não pode ser excluído enquanto houver usuários com esse cargo');
        }
      }
      
      const { data: userProfileData, error: userError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (userError || !userProfileData) {
        throw new Error('Erro ao verificar permissões do usuário');
      }
      
      const serverUserRole = userProfileData.role;
      
      // Server-side validation rules
      if (serverUserRole !== 'Administrador') {
        throw new Error('Somente Administradores podem excluir cargos');
      }
      
      // First reassign users with this role to "Usuário"
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role: 'Usuário' })
        .eq('role', role);
      
      if (updateError) {
        throw updateError;
      }
      
      // Then delete the role permissions
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role', role);
      
      if (deleteError) {
        throw deleteError;
      }
    },
    onSuccess: () => {
      toast.success('Cargo excluído com sucesso. Usuários foram movidos para o cargo "Usuário"');
      setIsDeleteDialogOpen(false);
      setSelectedRole(null);
      queryClient.invalidateQueries({ queryKey: ['rolePermissions'] });
    },
    onError: (error) => {
      toast.error(`Erro ao excluir cargo: ${error.message}`);
    }
  });

  // Handle role submission
  const onAddRoleSubmit = (data: z.infer<typeof roleSchema>) => {
    // If trying to add "Administrador" role, show warning
    const validRole = toUserRole(data.roleName);
    
    if (validRole === 'Administrador') {
      setIsAdminWarningOpen(true);
      return;
    }
    
    if (validRole) {
      addRoleMutation.mutate(validRole);
    } else {
      toast.error('Nome de cargo inválido. Deve ser um dos tipos permitidos: Vendedor, Gerente, Administrador ou Usuário');
    }
  };
  
  // Confirm adding admin role after warning
  const confirmAddAdminRole = () => {
    const roleName = document.querySelector<HTMLInputElement>('input[name="roleName"]')?.value;
    const validRole = toUserRole(roleName || '');
    
    if (validRole === 'Administrador') {
      addRoleMutation.mutate(validRole);
    }
    
    setIsAdminWarningOpen(false);
  };

  // Handle permissions update
  const onPermissionsSubmit = (data: z.infer<typeof permissionSchema>) => {
    if (selectedRole) {
      updatePermissionsMutation.mutate({
        role: selectedRole,
        permissions: {
          inventory: data.inventory,
          vehicle_details: data.vehicle_details,
          add_vehicle: data.add_vehicle
        }
      });
    }
  };

  // Handle role deletion
  const handleDeleteRole = () => {
    if (selectedRole) {
      if (selectedRole === 'Usuário') {
        toast.error('O cargo "Usuário" não pode ser excluído');
        return;
      }
      deleteRoleMutation.mutate(selectedRole);
    }
  };

  // Modified: Allow Gerentes to access the page, but not edit anything
  const canAccessPage = userRole === 'Administrador' || userRole === 'Gerente';
  if (!canAccessPage) {
    return <AccessRestrictedCard />;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gerenciamento de Cargos e Permissões</h1>
        {isAdmin && (
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Cargo
          </Button>
        )}
      </div>
      
      {userRole === 'Gerente' && <ManagerAlert />}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Cargos e Níveis de Permissão</CardTitle>
            <CardDescription>
              {isAdmin ? 
                "Gerencie quais cargos têm acesso a cada área do sistema." :
                "Visualize quais cargos têm acesso a cada área do sistema."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RoleTable 
              groupedPermissions={groupedPermissions} 
              userRole={userRole}
              onEditRole={(role) => {
                setSelectedRole(role);
                setIsEditDialogOpen(true);
              }}
              onDeleteRole={(role) => {
                setSelectedRole(role);
                setIsDeleteDialogOpen(true);
              }}
            />
          </CardContent>
          <CardFooter className="bg-muted/50 p-2 text-xs text-muted-foreground">
            <p>
              <strong>Níveis de permissão:</strong> 0 = Sem acesso, 1 = Visualizar, 
              2 = Editar básico, 5 = Editar completo, 7 = Excluir, 8 = Administrar, 10 = Acesso total
            </p>
          </CardFooter>
        </Card>
      )}

      {/* Dialog for adding a new role - Only shown to Admins */}
      {isAdmin && (
        <AddRoleDialog 
          isOpen={isAddDialogOpen}
          setIsOpen={setIsAddDialogOpen}
          onSubmit={onAddRoleSubmit}
          isPending={addRoleMutation.isPending}
        />
      )}

      {/* Admin role warning dialog */}
      <AdminWarningDialog 
        isOpen={isAdminWarningOpen}
        setIsOpen={setIsAdminWarningOpen}
        onConfirm={confirmAddAdminRole}
      />

      {/* Dialog for editing role permissions - Only shown to Admins */}
      {isAdmin && (
        <EditPermissionsDialog 
          isOpen={isEditDialogOpen}
          setIsOpen={setIsEditDialogOpen}
          selectedRole={selectedRole}
          groupedPermissions={groupedPermissions}
          onSubmit={onPermissionsSubmit}
          isPending={updatePermissionsMutation.isPending}
        />
      )}

      {/* Confirmation dialog for deleting a role - Only shown to Admins */}
      {isAdmin && (
        <DeleteRoleDialog 
          isOpen={isDeleteDialogOpen}
          setIsOpen={setIsDeleteDialogOpen}
          selectedRole={selectedRole}
          onDelete={handleDeleteRole}
          isPending={deleteRoleMutation.isPending}
        />
      )}
    </div>
  );
};

export default RoleManagement;

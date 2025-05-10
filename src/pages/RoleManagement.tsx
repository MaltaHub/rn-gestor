import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Loader2, Plus, Trash2, Save, Edit, AlertTriangle, ShieldAlert } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { AppArea, UserRoleType } from '@/types/permission';
import { Database } from '@/integrations/supabase/types';
import ProtectedArea from '@/components/ProtectedArea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toUserRole } from '@/utils/permission/types';

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

// Form schema for role name validation
const roleSchema = z.object({
  roleName: z.string().min(3, "O nome do cargo deve ter pelo menos 3 caracteres"),
});

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
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [groupedPermissions, setGroupedPermissions] = useState<GroupedPermissions>({});

  const isAdmin = userRole === 'Administrador';

  // Form for adding new role
  const addRoleForm = useForm({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      roleName: '',
    },
  });

  // Form for editing role permissions
  const editPermissionsForm = useForm({
    resolver: zodResolver(permissionSchema),
    defaultValues: {
      inventory: 1,
      vehicle_details: 1,
      add_vehicle: 0,
    },
  });

  // Fetch role permissions
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['rolePermissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*');

      if (error) {
        toast.error('Erro ao carregar permissões');
        throw error;
      }

      return data as RolePermission[];
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
  
  // Set form values when selecting a role to edit
  useEffect(() => {
    if (selectedRole && groupedPermissions[selectedRole]) {
      const rolePermissions = groupedPermissions[selectedRole];
      editPermissionsForm.reset({
        inventory: rolePermissions.inventory,
        vehicle_details: rolePermissions.vehicle_details,
        add_vehicle: rolePermissions.add_vehicle,
      });
    }
  }, [selectedRole, groupedPermissions, editPermissionsForm]);

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
      
      // Nova regra: Admins não podem criar cargos de Gerente
      if (roleName === 'Gerente') {
        throw new Error('O cargo de Gerente não pode ser criado');
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
      addRoleForm.reset();
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
      
      // Nova regra: Apenas Administradores podem editar permissões
      const userIsAdmin = userRole === 'Administrador';
      
      if (!userIsAdmin) {
        throw new Error('Apenas Administradores podem modificar permissões');
      }
      
      // Nova regra: Admins não podem editar permissões de Gerentes
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
      
      // Nova regra: Apenas Administradores podem excluir cargos
      if (userRole !== 'Administrador') {
        throw new Error('Somente Administradores podem excluir cargos');
      }
      
      // Nova regra: Admins não podem excluir o cargo Gerente
      if (role === 'Gerente') {
        throw new Error('O cargo Gerente não pode ser excluído');
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
    // Validate that the roleName is a valid UserRole before passing it
    const validRole = toUserRole(data.roleName);
    
    if (validRole) {
      addRoleMutation.mutate(validRole);
    } else {
      toast.error('Nome de cargo inválido. Deve ser um dos tipos permitidos: Vendedor, Gerente, Administrador ou Usuário');
    }
  };

  // Handle permissions update
  const onPermissionsSubmit = (data: z.infer<typeof permissionSchema>) => {
    if (selectedRole) {
      updatePermissionsMutation.mutate({
        role: selectedRole,
        permissions: {
          // Ensure all properties are non-optional by providing explicit values
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

  // Check if user can edit a specific role
  const canEditRole = (role: UserRole): boolean => {
    // Nova regra: Somente admin pode editar e nenhum cargo de Gerente pode ser editado
    return isAdmin && role !== 'Gerente';
  };

  // Check if user can delete a specific role
  const canDeleteRole = (role: UserRole): boolean => {
    if (role === 'Usuário') return false; // Usuário cannot be deleted
    if (role === 'Gerente') return false; // Gerente cannot be deleted
    
    // Nova regra: Somente admin pode excluir cargos
    return isAdmin;
  };

  // Modificação: permitir que Gerentes acessem a página, mas não possam editar nada
  const canAccessPage = userRole === 'Administrador' || userRole === 'Gerente';
  if (!canAccessPage) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Você não tem permissão para gerenciar cargos e permissões.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Esta área é restrita para administradores e gerentes do sistema.</p>
          </CardContent>
        </Card>
      </div>
    );
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
      
      {userRole === 'Gerente' && (
        <Alert className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Visualização Limitada</AlertTitle>
          <AlertDescription>
            Como Gerente, você pode apenas visualizar as permissões, mas não pode modificá-las.
          </AlertDescription>
        </Alert>
      )}

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
                              disabled={!canEditRole(role as UserRole)}
                              onClick={() => {
                                setSelectedRole(role as UserRole);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={!canDeleteRole(role as UserRole)}
                              onClick={() => {
                                setSelectedRole(role as UserRole);
                                setIsDeleteDialogOpen(true);
                              }}
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
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Novo Cargo</DialogTitle>
              <DialogDescription>
                Insira o nome do novo cargo. Permissões padrão serão definidas inicialmente.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...addRoleForm}>
              <form onSubmit={addRoleForm.handleSubmit(onAddRoleSubmit)} className="space-y-4">
                <FormField
                  control={addRoleForm.control}
                  name="roleName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Digite o nome do cargo" {...field} />
                      </FormControl>
                      <FormDescription>
                        O nome do cargo deve começar com letra maiúscula.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit"
                    disabled={addRoleMutation.isPending}
                  >
                    {addRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Adicionar
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog for editing role permissions - Only shown to Admins */}
      {isAdmin && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Permissões: {selectedRole}</DialogTitle>
              <DialogDescription>
                Defina os níveis de acesso para cada área do sistema.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...editPermissionsForm}>
              <form onSubmit={editPermissionsForm.handleSubmit(onPermissionsSubmit)} className="space-y-4">
                <FormField
                  control={editPermissionsForm.control}
                  name="inventory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estoque (inventory)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={10} {...field} />
                      </FormControl>
                      <FormDescription>
                        Nível de acesso ao estoque de veículos (0-10)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editPermissionsForm.control}
                  name="vehicle_details"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Detalhes do Veículo (vehicle_details)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={10} {...field} />
                      </FormControl>
                      <FormDescription>
                        Nível de acesso aos detalhes de veículos (0-10)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editPermissionsForm.control}
                  name="add_vehicle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adicionar Veículo (add_vehicle)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={10} {...field} />
                      </FormControl>
                      <FormDescription>
                        Nível de acesso para adicionar veículos (0-10)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updatePermissionsMutation.isPending}
                  >
                    {updatePermissionsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation dialog for deleting a role - Only shown to Admins */}
      {isAdmin && (
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
              <DialogDescription>
                Tem certeza de que deseja excluir o cargo "{selectedRole}"? 
                Todos os usuários com este cargo serão alterados para o cargo "Usuário".
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                type="button"
                variant="destructive"
                onClick={handleDeleteRole}
                disabled={deleteRoleMutation.isPending}
              >
                {deleteRoleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default RoleManagement;

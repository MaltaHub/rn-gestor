
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Database } from '@/integrations/supabase/types';

type UserRole = Database['public']['Enums']['user_role'];

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

interface EditPermissionsDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  selectedRole: UserRole | null;
  groupedPermissions: GroupedPermissions;
  onSubmit: (data: z.infer<typeof permissionSchema>) => void;
  isPending: boolean;
}

const EditPermissionsDialog: React.FC<EditPermissionsDialogProps> = ({
  isOpen,
  setIsOpen,
  selectedRole,
  groupedPermissions,
  onSubmit,
  isPending,
}) => {
  const form = useForm({
    resolver: zodResolver(permissionSchema),
    defaultValues: {
      inventory: 1,
      vehicle_details: 1,
      add_vehicle: 0,
    },
  });

  // Update form when role or permissions change
  useEffect(() => {
    if (selectedRole && groupedPermissions[selectedRole]) {
      const rolePermissions = groupedPermissions[selectedRole];
      form.reset({
        inventory: rolePermissions.inventory,
        vehicle_details: rolePermissions.vehicle_details,
        add_vehicle: rolePermissions.add_vehicle,
      });
    }
  }, [selectedRole, groupedPermissions, form]);

  const handleSubmit = (data: z.infer<typeof permissionSchema>) => {
    onSubmit(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Permissões: {selectedRole}</DialogTitle>
          <DialogDescription>
            Defina os níveis de acesso para cada área do sistema.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
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
              control={form.control}
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
              control={form.control}
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
                onClick={() => setIsOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditPermissionsDialog;


import React, { useState, useEffect } from 'react';
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
import { useRoles } from '@/hooks/permission/useRoles';

// Form schema for role name validation
export const roleSchema = z.object({
  roleName: z.string().min(3, "O nome do cargo deve ter pelo menos 3 caracteres"),
});

interface AddRoleDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSubmit: (data: z.infer<typeof roleSchema>) => void;
  isPending: boolean;
}

const AddRoleDialog: React.FC<AddRoleDialogProps> = ({
  isOpen,
  setIsOpen,
  onSubmit,
  isPending,
}) => {
  // Obter lista de cargos existentes para validação
  const { roles, isLoading: loadingRoles } = useRoles();
  const [existingRoles, setExistingRoles] = useState<string[]>([]);
  
  useEffect(() => {
    if (roles) {
      setExistingRoles(roles.map(role => role.toLowerCase()));
    }
  }, [roles]);

  // Esquema com validação adicional para evitar duplicação de cargos
  const formSchema = roleSchema.refine(
    data => !existingRoles.includes(data.roleName.toLowerCase()),
    {
      message: "Este cargo já existe no sistema",
      path: ["roleName"],
    }
  );

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      roleName: '',
    },
  });

  const handleSubmit = (data: z.infer<typeof roleSchema>) => {
    onSubmit(data);
    if (!isPending) {
      form.reset();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Novo Cargo</DialogTitle>
          <DialogDescription>
            Insira o nome do novo cargo. Permissões padrão serão definidas inicialmente.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="roleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Cargo</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite o nome do cargo" {...field} />
                  </FormControl>
                  <FormDescription>
                    O nome do cargo deve começar com letra maiúscula e ser único.
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
                disabled={isPending || loadingRoles}
              >
                {(isPending || loadingRoles) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddRoleDialog;

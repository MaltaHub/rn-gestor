
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Vendido } from "@/types";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";

export const useSales = () => {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const queryClient = useQueryClient();

  // Fetch sales data
  const {
    data: sales = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['sales', currentStore],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendidos')
        .select(`
          *,
          vehicles!inner(plate, model, color, year)
        `)
        .eq('store', currentStore)
        .order('data_venda', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar vendas:', error);
        toast.error('Erro ao carregar vendas');
        return [];
      }
      
      return data;
    },
    enabled: !!user
  });

  // Create sale mutation
  const createSaleMutation = useMutation({
    mutationFn: async (saleData: Omit<Vendido, 'id' | 'created_at'>) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('vendidos')
        .insert({
          ...saleData,
          vendido_por: user.id
        });

      if (error) {
        throw new Error(`Erro ao registrar venda: ${error.message}`);
      }

      // Update vehicle status to sold
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({ status: 'sold' })
        .eq('id', saleData.vehicle_id);

      if (vehicleError) {
        throw new Error(`Erro ao atualizar status do veículo: ${vehicleError.message}`);
      }

      // If price reduction requires approval, create task using the correct table structure
      if (saleData.aprovacao_reducao) {
        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            ref_id: saleData.vehicle_id,
            ref_table: 'vehicles',
            kind: 'PRICE_REVIEW',
            description: `Venda com redução de preço para R$ ${saleData.valor_venda}. CPF: ${saleData.cpf_cliente}`,
            status: 'pending'
          });

        if (taskError) {
          console.warn('Erro ao criar tarefa de aprovação:', taskError);
        }
      }
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      console.error('Erro ao registrar venda:', error);
      toast.error(error.message);
    }
  });

  return {
    sales,
    isLoading,
    createSale: createSaleMutation.mutate,
    isCreating: createSaleMutation.isPending,
    refetch
  };
};

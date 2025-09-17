import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import type {
  ConfigurationCategory,
  ConfigurationItem,
  ConfigurationItemInput,
  ConfigurationItemUpdate,
} from "@/types/configuration";

const CONFIGURATION_QUERY_KEY = ["configuration-items"] as const;

type MutationContext = {
  category?: ConfigurationCategory;
};

const sortConfigurationItems = (items: ConfigurationItem[]): ConfigurationItem[] => {
  return [...items].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name);
  });
};

export const useConfigurationManager = () => {
  const queryClient = useQueryClient();

  const {
    data: configurationItems = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ConfigurationItem[]>({
    queryKey: CONFIGURATION_QUERY_KEY,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("configuration_items")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (queryError) {
        console.error("Erro ao carregar configurações:", queryError);
        throw queryError;
      }

      return (data || []) as ConfigurationItem[];
    },
  });

  const invalidateCache = async () => {
    await queryClient.invalidateQueries({ queryKey: CONFIGURATION_QUERY_KEY });
  };

  const addMutation = useMutation<ConfigurationItem, Error, ConfigurationItemInput, MutationContext>({
    mutationFn: async (payload) => {
      const { data, error: insertError } = await supabase
        .from("configuration_items")
        .insert([payload])
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      return data as ConfigurationItem;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: CONFIGURATION_QUERY_KEY });
      return { category: variables.category };
    },
    onSuccess: async (data) => {
      toast.success("Configuração criada com sucesso");
      await invalidateCache();
      return data;
    },
    onError: (mutationError) => {
      console.error("Erro ao criar configuração:", mutationError);
      toast.error("Não foi possível criar a configuração");
    },
  });

  const updateMutation = useMutation<ConfigurationItem, Error, { id: string; updates: ConfigurationItemUpdate }, MutationContext>({
    mutationFn: async ({ id, updates }) => {
      const { data, error: updateError } = await supabase
        .from("configuration_items")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return data as ConfigurationItem;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: CONFIGURATION_QUERY_KEY });
      return { category: configurationItems.find((item) => item.id === variables.id)?.category };
    },
    onSuccess: async () => {
      toast.success("Configuração atualizada com sucesso");
      await invalidateCache();
    },
    onError: (mutationError) => {
      console.error("Erro ao atualizar configuração:", mutationError);
      toast.error("Não foi possível atualizar a configuração");
    },
  });

  const deleteMutation = useMutation<null, Error, { id: string }, MutationContext>({
    mutationFn: async ({ id }) => {
      const { error: deleteError } = await supabase
        .from("configuration_items")
        .delete()
        .eq("id", id);

      if (deleteError) {
        throw deleteError;
      }

      return null;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: CONFIGURATION_QUERY_KEY });
      return { category: configurationItems.find((item) => item.id === variables.id)?.category };
    },
    onSuccess: async () => {
      toast.success("Configuração removida");
      await invalidateCache();
    },
    onError: (mutationError) => {
      console.error("Erro ao remover configuração:", mutationError);
      toast.error("Não foi possível remover a configuração");
    },
  });

  const toggleStatusMutation = useMutation<ConfigurationItem, Error, { id: string; isActive: boolean }, MutationContext>({
    mutationFn: async ({ id, isActive }) => {
      const { data, error: toggleError } = await supabase
        .from("configuration_items")
        .update({ is_active: isActive })
        .eq("id", id)
        .select("*")
        .single();

      if (toggleError) {
        throw toggleError;
      }

      return data as ConfigurationItem;
    },
    onSuccess: async () => {
      await invalidateCache();
    },
    onError: (mutationError) => {
      console.error("Erro ao atualizar status de configuração:", mutationError);
      toast.error("Não foi possível atualizar o status da configuração");
    },
  });

  const groupedItems = useMemo(() => {
    const baseGroups: Record<ConfigurationCategory, ConfigurationItem[]> = {
      features: [],
      models: [],
      locations: [],
      stores: [],
    };

    sortConfigurationItems(configurationItems).forEach((item) => {
      baseGroups[item.category] = [...baseGroups[item.category], item];
    });

    return baseGroups;
  }, [configurationItems]);

  return {
    items: sortConfigurationItems(configurationItems),
    groupedItems,
    isLoading,
    error,
    refetch,
    addItem: addMutation.mutateAsync,
    updateItem: updateMutation.mutateAsync,
    deleteItem: deleteMutation.mutateAsync,
    toggleItemStatus: (id: string, isActive: boolean) =>
      toggleStatusMutation.mutateAsync({ id, isActive }),
    isMutating:
      addMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      toggleStatusMutation.isPending,
  };
};


import { supabase } from "@/integrations/supabase/client";
import { Vehicle, StoreType } from "@/types";
import { toast } from "@/components/ui/sonner";

export const addVehicle = async (
  vehicle: Omit<Vehicle, 'id' | 'added_at'>,
  userId: string,
  store: StoreType
) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    const newVehicle = {
      user_id: userId,
      plate: vehicle.plate,
      model: vehicle.model,
      color: vehicle.color,
      mileage: vehicle.mileage,
      image_url: vehicle.image_url,
      price: vehicle.price,
      year: vehicle.year,
      description: vehicle.description || "",
      specifications: vehicle.specifications || {},
      status: vehicle.status,
      store: store as 'Roberto Automóveis' | 'RN Multimarcas',
      local: vehicle.local,
      documentacao: vehicle.documentacao,
      fotos_roberto: vehicle.fotos_roberto || false,
      fotos_rn: vehicle.fotos_rn || false
    };

    console.log("VehicleService - Dados sendo inseridos:", newVehicle);

    const { data, error } = await supabase
      .from('vehicles')
      .insert(newVehicle)
      .select()
      .single();

    if (error) {
      console.error("VehicleService - Erro ao inserir:", error);
      toast.error(`Erro ao adicionar veículo: ${error.message}`);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("VehicleService - Erro geral:", error);
    toast.error("Erro ao adicionar veículo");
    throw error;
  }
};

export const updateVehicle = async (
  id: string,
  updates: Partial<Vehicle>,
  userId: string
) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    console.log("VehicleService - ID do veículo:", id);
    console.log("VehicleService - Updates recebidos:", updates);

    // Buscar veículo atual da tabela vehicles
    const { data: vehicleToUpdate, error: fetchError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error("VehicleService - Erro ao buscar veículo:", fetchError);
      toast.error('Veículo não encontrado');
      throw fetchError;
    }

    console.log("VehicleService - Veículo atual:", vehicleToUpdate);

    // Normalizar valores para comparação
    const normalize = (value: any) => (value === undefined || value === null || value === '') ? null : value;
    const normalizedPreviousState = Object.fromEntries(
      Object.entries(vehicleToUpdate).map(([key, value]) => [key, normalize(value)])
    );

    const supabaseUpdates: any = {};
    Object.entries(updates).forEach(([key, value]) => {
      const normalizedValue = normalize(value);
      if (normalizedValue !== normalizedPreviousState[key]) {
        supabaseUpdates[key] = normalizedValue;
      }
    });

    console.log("VehicleService - Updates finais para o banco:", supabaseUpdates);

    if (Object.keys(supabaseUpdates).length === 0) {
      toast.info("Nenhuma alteração detectada");
      return { previousState: normalizedPreviousState, currentState: normalizedPreviousState };
    }

    // Atualizar na tabela vehicles
    const { data, error } = await supabase
      .from('vehicles')
      .update(supabaseUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("VehicleService - Erro ao atualizar:", error);
      toast.error(`Erro ao atualizar veículo: ${error.message}`);
      throw error;
    }

    console.log("VehicleService - Dados atualizados com sucesso:", data);
    return { previousState: normalizedPreviousState, currentState: data };
  } catch (error) {
    console.error("VehicleService - Erro geral na atualização:", error);
    toast.error("Erro ao atualizar veículo");
    throw error;
  }
};

export const deleteVehicle = async (
  id: string,
  userId: string,
  userRole: string
) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  if (!id) {
    toast.error("ID do veículo inválido");
    throw new Error("ID do veículo inválido");
  }

  if (userRole !== "admin") {
    toast.error("Apenas administradores podem excluir veículos");
    throw new Error("Permissão negada");
  }

  try {
    // Deletar da tabela vehicles
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao remover veículo');
      throw error;
    }

    return true;
  } catch (error) {
    toast.error("Erro ao remover veículo");
    throw error;
  }
};

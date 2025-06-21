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

export const updateVehicleWithPendencyRecalc = async (
  vehicleId: string,
  updates: any,
  userId: string
): Promise<{ success: boolean; message: string; data?: any }> => {
  try {
    console.log("VehicleService - Updating vehicle with pendency recalc:", vehicleId);
    console.log("VehicleService - Updates:", updates);
    console.log("VehicleService - User:", userId);

    // Realizar a atualização (os triggers do banco irão gerar as tarefas automaticamente)
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('id', vehicleId)
      .select()
      .single();

    if (error) {
      console.error("VehicleService - Update error:", error);
      return { 
        success: false, 
        message: `Erro ao atualizar veículo: ${error.message}` 
      };
    }

    console.log("VehicleService - Vehicle updated successfully:", data);
    
    // Toast de feedback baseado nas mudanças detectadas
    const changedFields = Object.keys(updates);
    let feedbackMessage = "Veículo atualizado com sucesso!";
    
    if (changedFields.includes('price')) {
      feedbackMessage += " Tarefas de atualização de preço criadas automaticamente.";
    }
    
    if (changedFields.includes('status') && updates.status === 'sold') {
      feedbackMessage += " Tarefas de remoção de anúncios criadas automaticamente.";
    }
    
    if (changedFields.some(field => ['fotos_roberto', 'fotos_rn', 'image_url'].includes(field))) {
      feedbackMessage += " Tarefas de atualização de fotos criadas automaticamente.";
    }

    return { 
      success: true, 
      message: feedbackMessage,
      data 
    };
  } catch (error) {
    console.error("VehicleService - General error:", error);
    return { 
      success: false, 
      message: 'Erro interno do servidor ao atualizar veículo' 
    };
  }
};

export const triggerSystemRecalculation = async (): Promise<{ success: boolean; message: string }> => {
  try {
    console.log("VehicleService - Triggering system recalculation...");
    
    const { error } = await supabase.rpc('recalculate_all_pendencies');
    
    if (error) {
      console.error("VehicleService - Recalculation error:", error);
      return { 
        success: false, 
        message: `Erro ao recalcular sistema: ${error.message}` 
      };
    }
    
    console.log("VehicleService - System recalculated successfully");
    
    return { 
      success: true, 
      message: 'Sistema recalculado com sucesso! Novas tarefas foram geradas.' 
    };
  } catch (error) {
    console.error("VehicleService - General recalculation error:", error);
    return { 
      success: false, 
      message: 'Erro interno ao recalcular sistema' 
    };
  }
};

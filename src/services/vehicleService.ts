
import { supabase } from "@/integrations/supabase/client";
import { Vehicle, StoreType } from "@/types";
import { toast } from "@/components/ui/sonner";

export const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>, userId: string, store: StoreType) => {
  if (!userId) {
    console.error("Usuário não autenticado");
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    console.log("Dados do veículo a serem enviados:", vehicle);
    
    // Convert from Vehicle to SupabaseVehicle
    const newVehicle = {
      user_id: userId,
      plate: vehicle.plate,
      model: vehicle.model,
      color: vehicle.color,
      mileage: vehicle.mileage,
      image_url: vehicle.imageUrl,
      price: vehicle.price,
      year: vehicle.year,
      description: vehicle.description || "",
      specifications: vehicle.specifications || {},
      status: vehicle.status,
      store: store as 'Roberto Automóveis' | 'RN Multimarcas'
    };

    console.log("Dados formatados para o Supabase:", newVehicle);

    const { data, error } = await supabase
      .from('vehicles')
      .insert(newVehicle)
      .select()
      .single();

    if (error) {
      console.error('Erro detalhado ao adicionar veículo:', error);
      toast.error(`Erro ao adicionar veículo: ${error.message}`);
      throw error;
    }

    console.log("Veículo adicionado com sucesso:", data);
    return data;
  } catch (error) {
    console.error("Erro ao adicionar veículo:", error);
    throw error;
  }
};

export const updateVehicle = async (id: string, updates: Partial<Vehicle>, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    // Fetch current vehicle for comparison
    const { data: vehicleToUpdate, error: fetchError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      console.error('Erro ao buscar veículo para atualização:', fetchError);
      toast.error('Veículo não encontrado');
      throw fetchError;
    }

    // Convert from Vehicle updates to SupabaseVehicle updates
    const supabaseUpdates: any = {};
    
    if (updates.plate) supabaseUpdates.plate = updates.plate;
    if (updates.model) supabaseUpdates.model = updates.model;
    if (updates.color) supabaseUpdates.color = updates.color;
    if (updates.mileage !== undefined) supabaseUpdates.mileage = updates.mileage;
    if (updates.imageUrl) supabaseUpdates.image_url = updates.imageUrl;
    if (updates.price !== undefined) supabaseUpdates.price = updates.price;
    if (updates.year !== undefined) supabaseUpdates.year = updates.year;
    if (updates.description !== undefined) supabaseUpdates.description = updates.description;
    if (updates.specifications) supabaseUpdates.specifications = updates.specifications;
    if (updates.status) supabaseUpdates.status = updates.status;
    if (updates.store) supabaseUpdates.store = updates.store as 'Roberto Automóveis' | 'RN Multimarcas';

    // Update vehicle
    const { error: updateError } = await supabase
      .from('vehicles')
      .update(supabaseUpdates)
      .eq('id', id);
    
    if (updateError) {
      console.error('Erro ao atualizar veículo:', updateError);
      toast.error('Erro ao atualizar veículo');
      throw updateError;
    }

    return { previousState: vehicleToUpdate, currentState: { ...vehicleToUpdate, ...supabaseUpdates } };
  } catch (error) {
    console.error("Erro ao atualizar veículo:", error);
    throw error;
  }
};

export const deleteVehicle = async (id: string, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Erro ao remover veículo:', error);
      toast.error('Erro ao remover veículo');
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Erro ao remover veículo:", error);
    throw error;
  }
};

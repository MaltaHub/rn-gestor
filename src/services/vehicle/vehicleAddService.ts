
import { supabase } from "@/integrations/supabase/client";
import { Vehicle } from "@/types";
import { toast } from "@/components/ui/sonner";

/**
 * Adds a new vehicle to the database
 * @param vehicle Vehicle data
 * @param userId User adding the vehicle
 * @returns Promise with the newly created vehicle
 */
export const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'addedAt'>, userId: string) => {
  if (!userId) {
    toast.error("Usuário não autenticado");
    throw new Error("Usuário não autenticado");
  }

  try {
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
      description: vehicle.description,
      specifications: vehicle.specifications,
      status: vehicle.status
    };

    const { data, error } = await supabase
      .from('vehicles')
      .insert(newVehicle)
      .select()
      .single();

    if (error) {
      console.error('Erro ao adicionar veículo:', error);
      toast.error('Erro ao adicionar veículo');
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Erro ao adicionar veículo:", error);
    throw error;
  }
};

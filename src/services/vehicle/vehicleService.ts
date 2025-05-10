
import { supabase } from "@/integrations/supabase/client";
import { Vehicle } from "@/types";
import { toast } from "@/components/ui/sonner";
import { withFeaturePermission } from "@/utils/permission";
import { recordFieldChange } from "./vehicleHistoryService";

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
    const supabaseUpdates: any = {
      updated_at: new Date().toISOString(),
      updated_by: userId
    };
    
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

    // Track changes to the vehicle
    const changePromises = [];
    
    // For each field that has changed, add to history
    if (updates.plate && updates.plate !== vehicleToUpdate.plate) {
      changePromises.push(recordFieldChange(id, 'plate', vehicleToUpdate.plate, updates.plate, userId));
    }
    
    if (updates.model && updates.model !== vehicleToUpdate.model) {
      changePromises.push(recordFieldChange(id, 'model', vehicleToUpdate.model, updates.model, userId));
    }
    
    if (updates.color && updates.color !== vehicleToUpdate.color) {
      changePromises.push(recordFieldChange(id, 'color', vehicleToUpdate.color, updates.color, userId));
    }
    
    if (updates.mileage !== undefined && updates.mileage !== vehicleToUpdate.mileage) {
      changePromises.push(recordFieldChange(id, 'mileage', String(vehicleToUpdate.mileage), String(updates.mileage), userId));
    }
    
    if (updates.imageUrl && updates.imageUrl !== vehicleToUpdate.image_url) {
      changePromises.push(recordFieldChange(id, 'image_url', vehicleToUpdate.image_url, updates.imageUrl, userId));
    }
    
    if (updates.price !== undefined && updates.price !== vehicleToUpdate.price) {
      changePromises.push(recordFieldChange(id, 'price', String(vehicleToUpdate.price), String(updates.price), userId));
    }
    
    if (updates.year !== undefined && updates.year !== vehicleToUpdate.year) {
      changePromises.push(recordFieldChange(id, 'year', String(vehicleToUpdate.year), String(updates.year), userId));
    }
    
    if (updates.description !== undefined && updates.description !== vehicleToUpdate.description) {
      changePromises.push(recordFieldChange(id, 'description', vehicleToUpdate.description || '', updates.description || '', userId));
    }
    
    if (updates.status && updates.status !== vehicleToUpdate.status) {
      changePromises.push(recordFieldChange(id, 'status', vehicleToUpdate.status, updates.status, userId));
    }
    
    // For specifications, we need to check each property
    if (updates.specifications && vehicleToUpdate.specifications) {
      const oldSpecs = vehicleToUpdate.specifications;
      const newSpecs = updates.specifications;
      
      // Check engine
      if (newSpecs.engine !== undefined && 
          (typeof oldSpecs === 'object' && oldSpecs !== null && 'engine' in oldSpecs) && 
          newSpecs.engine !== oldSpecs.engine) {
        changePromises.push(recordFieldChange(
          id, 
          'specifications.engine', 
          String(oldSpecs.engine || ''), 
          String(newSpecs.engine || ''), 
          userId
        ));
      }
      
      // Check transmission
      if (newSpecs.transmission !== undefined && 
          (typeof oldSpecs === 'object' && oldSpecs !== null && 'transmission' in oldSpecs) && 
          newSpecs.transmission !== oldSpecs.transmission) {
        changePromises.push(recordFieldChange(
          id, 
          'specifications.transmission', 
          String(oldSpecs.transmission || ''), 
          String(newSpecs.transmission || ''), 
          userId
        ));
      }
      
      // Check fuel
      if (newSpecs.fuel !== undefined && 
          (typeof oldSpecs === 'object' && oldSpecs !== null && 'fuel' in oldSpecs) && 
          newSpecs.fuel !== oldSpecs.fuel) {
        changePromises.push(recordFieldChange(
          id, 
          'specifications.fuel', 
          String(oldSpecs.fuel || ''), 
          String(newSpecs.fuel || ''), 
          userId
        ));
      }
    }

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
    
    // Record all changes in parallel
    if (changePromises.length > 0) {
      await Promise.all(changePromises);
    }

    return { previousState: vehicleToUpdate, currentState: { ...vehicleToUpdate, ...supabaseUpdates } };
  } catch (error) {
    console.error("Erro ao atualizar veículo:", error);
    throw error;
  }
};

/**
 * Deletes a vehicle from the database
 * @param id Vehicle ID
 * @param userId User making the deletion
 * @returns Promise with success/error status
 */
export const deleteVehicle = async (id: string, userId: string) => {
  return withFeaturePermission(
    userId,
    'delete-vehicle',
    async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id)
        .single();

      if (error) {
        console.error("Error deleting vehicle:", error);
        throw new Error("Failed to delete vehicle");
      }

      // Create a record in vehicle_change_history
      await supabase.from('vehicle_change_history').insert({
        vehicle_id: id,
        changed_by: userId,
        field_name: 'status',
        old_value: 'active',
        new_value: 'deleted'
      });

      return { success: true };
    },
    () => {
      throw new Error("Permission denied: You don't have permission to delete vehicles");
    }
  );
};

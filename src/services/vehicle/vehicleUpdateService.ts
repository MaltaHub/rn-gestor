
import { supabase } from "@/integrations/supabase/client";
import { Vehicle } from "@/types";
import { toast } from "@/components/ui/sonner";
import { recordFieldChange } from "./vehicleHistoryService";

/**
 * Updates a vehicle in the database
 * @param id Vehicle ID
 * @param updates Vehicle update data
 * @param userId User making the update
 * @returns Promise with previous and current vehicle state
 */
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
    const changePromises = await trackVehicleChanges(id, vehicleToUpdate, updates, userId);
    
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
 * Track changes to vehicle fields and prepare history records
 * @param vehicleId ID of the vehicle
 * @param oldVehicle Previous vehicle state
 * @param updates New vehicle values
 * @param userId ID of the user making changes
 * @returns Array of promises for history records
 */
const trackVehicleChanges = async (
  vehicleId: string, 
  oldVehicle: any, 
  updates: Partial<Vehicle>, 
  userId: string
): Promise<Promise<void>[]> => {
  const changePromises: Promise<void>[] = [];
  
  // For each field that has changed, add to history
  if (updates.plate && updates.plate !== oldVehicle.plate) {
    changePromises.push(recordFieldChange(vehicleId, 'plate', oldVehicle.plate, updates.plate, userId));
  }
  
  if (updates.model && updates.model !== oldVehicle.model) {
    changePromises.push(recordFieldChange(vehicleId, 'model', oldVehicle.model, updates.model, userId));
  }
  
  if (updates.color && updates.color !== oldVehicle.color) {
    changePromises.push(recordFieldChange(vehicleId, 'color', oldVehicle.color, updates.color, userId));
  }
  
  if (updates.mileage !== undefined && updates.mileage !== oldVehicle.mileage) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'mileage', 
      String(oldVehicle.mileage), 
      String(updates.mileage), 
      userId
    ));
  }
  
  if (updates.imageUrl && updates.imageUrl !== oldVehicle.image_url) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'image_url', 
      oldVehicle.image_url, 
      updates.imageUrl, 
      userId
    ));
  }
  
  if (updates.price !== undefined && updates.price !== oldVehicle.price) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'price', 
      String(oldVehicle.price), 
      String(updates.price), 
      userId
    ));
  }
  
  if (updates.year !== undefined && updates.year !== oldVehicle.year) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'year', 
      String(oldVehicle.year), 
      String(updates.year), 
      userId
    ));
  }
  
  if (updates.description !== undefined && updates.description !== oldVehicle.description) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'description', 
      oldVehicle.description || '', 
      updates.description || '', 
      userId
    ));
  }
  
  if (updates.status && updates.status !== oldVehicle.status) {
    changePromises.push(recordFieldChange(
      vehicleId, 
      'status', 
      oldVehicle.status, 
      updates.status, 
      userId
    ));
  }
  
  // For specifications, we need to check each property
  if (updates.specifications && oldVehicle.specifications) {
    const oldSpecs = oldVehicle.specifications;
    const newSpecs = updates.specifications;
    
    // Check engine
    if (newSpecs.engine !== undefined && 
        (typeof oldSpecs === 'object' && oldSpecs !== null && 'engine' in oldSpecs) && 
        newSpecs.engine !== oldSpecs.engine) {
      changePromises.push(recordFieldChange(
        vehicleId, 
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
        vehicleId, 
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
        vehicleId, 
        'specifications.fuel', 
        String(oldSpecs.fuel || ''), 
        String(newSpecs.fuel || ''), 
        userId
      ));
    }
  }
  
  return changePromises;
}

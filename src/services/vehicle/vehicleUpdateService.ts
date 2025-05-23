
import { supabase } from "@/integrations/supabase/client";
import { Vehicle } from "@/types";
import { recordFieldChange } from "./vehicleHistoryService";

/**
 * Updates a vehicle in the database
 * @param id Vehicle ID
 * @param updates Fields to update
 * @param userId User making the update
 * @returns Promise with the updated vehicle
 */
export const updateVehicle = async (id: string, updates: Partial<Vehicle>, userId: string) => {
  try {
    // Get the current vehicle data to compare changes
    const { data: currentVehicle, error: fetchError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error("Error fetching current vehicle:", fetchError);
      throw new Error("Failed to fetch current vehicle data");
    }

    // Convert from Vehicle to SupabaseVehicle format
    const updateData = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
      // Map properties from the update to the database format
      ...(updates.plate !== undefined && { plate: updates.plate }),
      ...(updates.model !== undefined && { model: updates.model }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.mileage !== undefined && { mileage: updates.mileage }),
      ...(updates.imageUrl !== undefined && { image_url: updates.imageUrl }),
      ...(updates.price !== undefined && { price: updates.price }),
      ...(updates.year !== undefined && { year: updates.year }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.specifications !== undefined && { specifications: updates.specifications }),
      ...(updates.status !== undefined && { status: updates.status })
    };

    // Update the vehicle
    const { data, error } = await supabase
      .from('vehicles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Error updating vehicle:", error);
      throw new Error("Failed to update vehicle");
    }

    // Record changes in history
    for (const [key, newValue] of Object.entries(updateData)) {
      if (key !== 'updated_by' && key !== 'updated_at' && currentVehicle[key] !== newValue) {
        const oldValue = currentVehicle[key] === null ? 'null' : String(currentVehicle[key]);
        const newValueStr = newValue === null ? 'null' : String(newValue);
        
        await recordFieldChange(
          id,
          key,
          oldValue,
          newValueStr,
          userId
        );
      }
    }

    return data;
  } catch (error) {
    console.error("Error in updateVehicle:", error);
    throw error;
  }
};


import { supabase } from "@/integrations/supabase/client";
import { Vehicle } from "@/types";

export const updateVehicle = async (
  id: string, 
  updates: Partial<Vehicle>, 
  userId: string
): Promise<Vehicle> => {
  try {
    // Get the current vehicle data
    const { data: currentVehicle, error: fetchError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error("Error fetching vehicle:", fetchError);
      throw new Error("Failed to fetch vehicle");
    }

    // Prepare the update data
    const updateData = {
      ...updates,
      updated_by: userId,
      updated_at: new Date()
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

    // Create history records for each changed field
    if (currentVehicle) {
      const changedFields = getChangedFields(currentVehicle, updates);
      
      if (changedFields.length > 0) {
        const historyRecords = changedFields.map(field => ({
          vehicle_id: id,
          changed_by: userId,
          field_name: field.name,
          old_value: String(field.oldValue),
          new_value: String(field.newValue)
        }));

        const { error: historyError } = await supabase
          .from('vehicle_change_history')
          .insert(historyRecords);

        if (historyError) {
          console.error("Error creating history records:", historyError);
        }
      }
    }

    return data;
  } catch (error) {
    console.error("Error in updateVehicle:", error);
    throw error;
  }
};

// Helper function to get changed fields
function getChangedFields(
  currentVehicle: Vehicle, 
  updates: Partial<Vehicle>
): { name: string, oldValue: any, newValue: any }[] {
  const changes = [];

  // Check simple fields
  const simpleFields = ['model', 'plate', 'color', 'year', 'price', 'mileage', 'status', 'image_url', 'description'];
  for (const field of simpleFields) {
    if (field in updates && updates[field as keyof Vehicle] !== currentVehicle[field as keyof Vehicle]) {
      changes.push({
        name: field,
        oldValue: currentVehicle[field as keyof Vehicle],
        newValue: updates[field as keyof Vehicle]
      });
    }
  }

  // Check specifications (if present)
  if (updates.specifications && currentVehicle.specifications) {
    for (const [key, value] of Object.entries(updates.specifications)) {
      if (value !== currentVehicle.specifications[key]) {
        changes.push({
          name: `specifications.${key}`,
          oldValue: currentVehicle.specifications[key] || '',
          newValue: value
        });
      }
    }
  }

  return changes;
}

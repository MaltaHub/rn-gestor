
import { SupabaseVehicle, Vehicle, SupabaseNotification, Notification } from "../types";

// Function to convert Supabase vehicle data to application format
export const mapSupabaseVehicleToVehicle = (supabaseVehicle: SupabaseVehicle): Vehicle => {
  return {
    id: supabaseVehicle.id,
    plate: supabaseVehicle.plate,
    model: supabaseVehicle.model,
    color: supabaseVehicle.color,
    mileage: supabaseVehicle.mileage,
    imageUrl: supabaseVehicle.image_url,
    price: supabaseVehicle.price as number,
    year: supabaseVehicle.year,
    description: supabaseVehicle.description,
    specifications: supabaseVehicle.specifications,
    status: supabaseVehicle.status,
    addedAt: supabaseVehicle.added_at,
    user_id: supabaseVehicle.user_id
  };
};

// Function to convert Supabase notification data to application format
export const mapSupabaseNotificationToNotification = (supabaseNotification: SupabaseNotification): Notification => {
  return {
    id: supabaseNotification.id,
    vehicleId: supabaseNotification.vehicle_id,
    vehicle_plate: supabaseNotification.vehicle_plate,
    message: supabaseNotification.message,
    details: supabaseNotification.details,
    is_read: supabaseNotification.is_read,
    created_at: supabaseNotification.created_at,
    read_at: supabaseNotification.read_at
  };
};

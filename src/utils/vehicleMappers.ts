import { SupabaseVehicle, Vehicle, SupabaseNotification, Notification, SupabaseVehicleImage, VehicleImage } from "../types";

// Function to convert Supabase vehicle data to application format
export const mapSupabaseVehicleToVehicle = (supabaseVehicle: SupabaseVehicle): Vehicle => {
  return {
    id: supabaseVehicle.id,
    plate: supabaseVehicle.plate,
    model: supabaseVehicle.model,
    color: supabaseVehicle.color,
    mileage: supabaseVehicle.mileage,
    image_url: supabaseVehicle.image_url,
    price: supabaseVehicle.price as number,
    year: supabaseVehicle.year,
    description: supabaseVehicle.description,
    specifications: supabaseVehicle.specifications,
    status: supabaseVehicle.status,
    added_at: supabaseVehicle.added_at,
    user_id: supabaseVehicle.user_id,
    store: supabaseVehicle.store
  };
};

// Function to convert Supabase vehicle image data to application format
export const mapSupabaseVehicleImageToVehicleImage = (supabaseVehicleImage: SupabaseVehicleImage): VehicleImage => {
  return {
    id: supabaseVehicleImage.id,
    vehicle_id: supabaseVehicleImage.vehicle_id,
    image_url: supabaseVehicleImage.image_url,
    display_order: supabaseVehicleImage.display_order,
    is_cover: supabaseVehicleImage.is_cover,
    uploaded_at: supabaseVehicleImage.uploaded_at,
    uploaded_by: supabaseVehicleImage.uploaded_by,
    store: supabaseVehicleImage.store
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
    is_hidden: supabaseNotification.is_hidden,
    created_at: supabaseNotification.created_at,
    read_at: supabaseNotification.read_at
  };
};

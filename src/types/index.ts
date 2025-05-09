
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  color: string;
  mileage: number;
  imageUrl: string;
  price: number;
  year: number;
  description?: string;
  specifications?: {
    engine?: string;
    transmission?: string;
    fuel?: string;
  };
  status: 'available' | 'sold' | 'reserved';
  addedAt: string;
  user_id?: string;
}

export interface Notification {
  id: string;
  vehicleId: string;
  vehicle_plate: string;
  message: string;
  details: string;
  is_read: boolean;
  created_at: string;
  user_id?: string;
}

// Interfaces para mapear os dados do Supabase para os tipos da aplicação
export interface SupabaseVehicle {
  id: string;
  plate: string;
  model: string;
  color: string;
  mileage: number;
  image_url: string;
  price: number;
  year: number;
  description?: string;
  specifications?: any;
  status: 'available' | 'sold' | 'reserved';
  added_at: string;
  user_id?: string;
}

export interface SupabaseNotification {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  message: string;
  details: string;
  is_read: boolean;
  created_at: string;
  user_id?: string;
}

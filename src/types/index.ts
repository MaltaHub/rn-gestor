export interface User {
  id: string;
  email: string;
  name: string;
}

export type StoreType = 'Roberto Automóveis' | 'RN Multimarcas';
export type PlatformType = 'OLX' | 'WhatsApp' | 'Mercado Livre' | 'Mobi Auto' | 'ICarros' | 'Na Pista' | 'Cockpit';

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
    renavam?: string;
    chassi?: string;
    tipoCarroceria?: string;
    municipio?: string;
    uf?: string;
    valorFipe?: string;
  };
  status: 'available' | 'sold' | 'reserved';
  addedAt: string;
  user_id?: string;
  store: StoreType;
}

export interface VehicleImage {
  id: string;
  vehicle_id: string;
  image_url: string;
  display_order: number;
  is_cover: boolean;
  uploaded_at: string;
  uploaded_by?: string;
  store: StoreType;
}

export interface Notification {
  id: string;
  vehicleId: string;
  vehicle_plate: string;
  message: string;
  details: string;
  is_read: boolean;
  is_hidden: boolean;
  created_at: string;
  read_at?: string;
}

export interface VehicleHistory {
  id: string;
  vehicle_id: string;
  changed_by: string;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  user_name: string;
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
  store: StoreType;
}

export interface SupabaseVehicleImage {
  id: string;
  vehicle_id: string;
  image_url: string;
  display_order: number;
  is_cover: boolean;
  uploaded_at: string;
  uploaded_by?: string;
  store: StoreType;
}

export interface SupabaseNotification {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  message: string;
  details: string;
  is_read: boolean;
  is_hidden: boolean;
  created_at: string;
  read_at?: string;
}

export interface SupabaseVehicleHistory {
  id: string;
  vehicle_id: string;
  changed_by: string;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  name: string;
}

import { Database } from '../integrations/supabase/types';

export type StoreType = 'Roberto Automóveis' | 'RN Multimarcas';
export type PlatformType = Database['public']['Enums']['platform_type'];

export interface Advertisement {
  id: string;
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  created_date: string;
  id_origem: string | null;
  advertised_price: number;
  description?: string;
  store: StoreType;
  created_at: string;
  updated_at: string;
}

export interface SupabaseAdvertisement {
  id: string;
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  created_date: string;
  id_origem: string | null;
  advertised_price: number;
  description?: string;
  store: StoreType;
  created_at: string;
  updated_at: string;
}

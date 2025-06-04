
export type StoreType = 'Roberto Automóveis' | 'RN Multimarcas';
export type PlatformType = 'OLX' | 'WhatsApp' | 'Mercado Livre' | 'Mobi Auto' | 'ICarros' | 'Na Pista' | 'Cockpit';

export interface Advertisement {
  id: string;
  id_ancora: string;
  platform: PlatformType;
  vehicle_plates: string[];
  created_date: string;
  id_origem: string | null;
  advertised_price: number;
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
  store: StoreType;
  created_at: string;
  updated_at: string;
}

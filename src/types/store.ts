
export type PlatformType = 
  | 'OLX'
  | 'WhatsApp'
  | 'Mercado Livre'
  | 'Mobi Auto'
  | 'ICarros'
  | 'Na Pista'
  | 'Cockpit'
  | 'Instagram';

export type TipoLoja = 'Roberto Automóveis' | 'RN Multimarcas';

export interface SupabaseAdvertisement {
  id: string;
  platform: PlatformType;
  created_date: string;
  id_origem?: string;
  advertised_price: number;
  store: TipoLoja;
  created_at: string;
  updated_at: string;
  ativo?: boolean;
  data_inicio?: string;
  data_fim?: string;
  id_ancora: string;
  vehicle_plates: string[];
  description?: string;
  publicado?: boolean;
  data_publicacao?: string;
  publicado_por?: string;
}

export interface Advertisement {
  id: string;
  platform: PlatformType;
  created_date: string;
  id_origem?: string;
  advertised_price: number;
  store: TipoLoja;
  created_at: string;
  updated_at: string;
  ativo?: boolean;
  data_inicio?: string;
  data_fim?: string;
  id_ancora: string;
  vehicle_plates: string[];
  description?: string;
  publicado?: boolean;
  data_publicacao?: string;
  publicado_por?: string;
}

export interface PendingWorkflowAction {
  type: 'publish_advertisement' | 'resolve_insight' | 'create_task';
  advertisement_id?: string;
  insight_id?: string;
  task_id?: string;
  metadata?: Record<string, any>;
}

export interface PendingWorkflowResult {
  success: boolean;
  message: string;
  data?: any;
}

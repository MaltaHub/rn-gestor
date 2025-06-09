export interface User {
  id: string;
  email: string;
  name: string;
}

export type StoreType = 'Roberto Automóveis' | 'RN Multimarcas';
export type PlatformType = 'OLX' | 'WhatsApp' | 'Mercado Livre' | 'Mobi Auto' | 'ICarros' | 'Na Pista' | 'Cockpit';

export type LocalType = 'Oficina' | 'Funilaria' | 'Polimento' | 'Bailon' | 'Robertão' | 'Laudo' | 'Perícia' | 'Trânsito';

export type DocumentacaoType = 'Recepção' | 'Fazendo Laudo' | 'Laudo Aprovado' | 'Laudo Reprovado' | 'Vistoria' | 'Transferência' | 'IPVA Pago' | 'IPVA Atrasado' | 'Multas Pendentes' | 'CRLV em Andamento' | 'CRLV Entregue' | 'Despacho Finalizado';

export type PrioridadeTarefa = 'baixa' | 'normal' | 'alta' | 'urgente';
export type TipoTarefa = 'geral' | 'aprovacao_reducao' | 'documentacao' | 'fotos';
export type CargoType = 'Consultor' | 'Gestor' | 'Gerente' | 'Administrador';

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  color: string;
  mileage: number;
  image_url: string; // Corrigido: usar image_url consistentemente
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
  added_at: string;
  user_id?: string;
  store: StoreType;
  // Novos campos
  local?: LocalType;
  documentacao?: DocumentacaoType;
  fotos_roberto?: boolean;
  fotos_rn?: boolean;
}

export interface VehicleWithIndicators extends Vehicle {
  indicador_amarelo: boolean;
  indicador_vermelho: boolean;
  indicador_lilas: boolean;
  image_url: string; // Adicionado para refletir o esquema correto
  anuncios?: Array<{
    platform: PlatformType;
    id_ancora: string;
    data_inicio: string;
    ativo: boolean;
  }>;
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

export interface Advertisement {
  id: string;
  platform: PlatformType;
  created_date: string;
  id_origem?: string;
  advertised_price: number;
  store: StoreType;
  description?: string;
  vehicle_plates: string[];
  id_ancora: string;
  ativo: boolean;
  data_inicio: string;
  data_fim?: string;
}

export interface Vendido {
  id: string;
  vehicle_id: string;
  cpf_cliente: string;
  forma_pagamento: string;
  seguro: boolean;
  entrada?: number;
  parcelas?: number;
  carro_troca?: string;
  abatimento?: number;
  valor_venda: number;
  aprovacao_reducao?: boolean;
  vendido_por?: string;
  data_venda: string;
  created_at: string;
  store: StoreType;
}

export interface Task {
  id: string;
  vehicle_id?: string;
  title: string;
  description?: string;
  completed: boolean;
  created_at: string;
  cargo_alvo?: CargoType;
  atribuido_para?: string;
  prioridade: PrioridadeTarefa;
  aprovacao_requerida: boolean;
  data_vencimento?: string;
  tipo_tarefa: TipoTarefa;
  related_field?: string;
  field_value?: string;
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
  local?: LocalType;
  documentacao?: DocumentacaoType;
  fotos_roberto?: boolean;
  fotos_rn?: boolean;
}

export interface SupabaseVehicleWithIndicators extends SupabaseVehicle {
  indicador_amarelo: boolean;
  indicador_vermelho: boolean;
  indicador_lilas: boolean;
  anuncios?: any;
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

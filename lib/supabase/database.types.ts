export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      anuncios: {
        Row: {
          created_at: string
          estado_anuncio: string
          id: string
          target_id: string
          updated_at: string
          valor_anuncio: number | null
        }
        Insert: {
          created_at?: string
          estado_anuncio: string
          id?: string
          target_id: string
          updated_at?: string
          valor_anuncio?: number | null
        }
        Update: {
          created_at?: string
          estado_anuncio?: string
          id?: string
          target_id?: string
          updated_at?: string
          valor_anuncio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_estado_anuncio_fkey"
            columns: ["estado_anuncio"]
            isOneToOne: false
            referencedRelation: "lookup_announcement_statuses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "anuncios_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: true
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
      caracteristicas_tecnicas: {
        Row: {
          caracteristica: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          caracteristica: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          caracteristica?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      caracteristicas_visuais: {
        Row: {
          caracteristica: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          caracteristica: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          caracteristica?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      carro_caracteristicas_tecnicas: {
        Row: {
          caracteristica_id: string
          carro_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          caracteristica_id: string
          carro_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          caracteristica_id?: string
          carro_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carro_caracteristicas_tecnicas_caracteristica_id_fkey"
            columns: ["caracteristica_id"]
            isOneToOne: false
            referencedRelation: "caracteristicas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carro_caracteristicas_tecnicas_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
      carro_caracteristicas_visuais: {
        Row: {
          caracteristica_id: string
          carro_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          caracteristica_id: string
          carro_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          caracteristica_id?: string
          carro_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carro_caracteristicas_visuais_caracteristica_id_fkey"
            columns: ["caracteristica_id"]
            isOneToOne: false
            referencedRelation: "caracteristicas_visuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carro_caracteristicas_visuais_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
      carros: {
        Row: {
          ano_fab: number | null
          ano_ipva_pago: number | null
          ano_mod: number | null
          atpv_e: string | null
          chassi: string | null
          cor: string | null
          created_at: string
          data_entrada: string
          data_venda: string | null
          em_estoque: boolean
          estado_anuncio: string | null
          estado_veiculo: string | null
          estado_venda: string
          foto_capa_id: string | null
          fotos_pasta_id: string | null
          hodometro: number | null
          id: string
          laudo: string | null
          local: string
          modelo_id: string
          nome: string | null
          placa: string
          preco_original: number | null
          renavam: string | null
          tem_chave_r: boolean | null
          tem_manual: boolean | null
          ultima_alteracao: string
          updated_at: string
        }
        Insert: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
          atpv_e?: string | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          data_venda?: string | null
          em_estoque?: boolean
          estado_anuncio?: string | null
          estado_veiculo?: string | null
          estado_venda: string
          foto_capa_id?: string | null
          fotos_pasta_id?: string | null
          hodometro?: number | null
          id?: string
          laudo?: string | null
          local: string
          modelo_id: string
          nome?: string | null
          placa: string
          preco_original?: number | null
          renavam?: string | null
          tem_chave_r?: boolean | null
          tem_manual?: boolean | null
          ultima_alteracao?: string
          updated_at?: string
        }
        Update: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
          atpv_e?: string | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          data_venda?: string | null
          em_estoque?: boolean
          estado_anuncio?: string | null
          estado_veiculo?: string | null
          estado_venda?: string
          foto_capa_id?: string | null
          fotos_pasta_id?: string | null
          hodometro?: number | null
          id?: string
          laudo?: string | null
          local?: string
          modelo_id?: string
          nome?: string | null
          placa?: string
          preco_original?: number | null
          renavam?: string | null
          tem_chave_r?: boolean | null
          tem_manual?: boolean | null
          ultima_alteracao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carros_estado_anuncio_fkey"
            columns: ["estado_anuncio"]
            isOneToOne: false
            referencedRelation: "lookup_announcement_statuses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "carros_estado_veiculo_fkey"
            columns: ["estado_veiculo"]
            isOneToOne: false
            referencedRelation: "lookup_vehicle_states"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "carros_estado_venda_fkey"
            columns: ["estado_venda"]
            isOneToOne: false
            referencedRelation: "lookup_sale_statuses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "carros_local_fkey"
            columns: ["local"]
            isOneToOne: false
            referencedRelation: "lookup_locations"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "carros_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      finalizados: {
        Row: {
          ano_fab: number | null
          ano_ipva_pago: number | null
          ano_mod: number | null
          banco_financiamento: string | null
          chassi: string | null
          cor: string | null
          created_at: string
          data_entrega: string | null
          data_venda: string | null
          finalizado_em: string
          hodometro: number | null
          id: string
          modelo: string
          placa: string
          renavam: string | null
          seguradora: string | null
          updated_at: string
          valor_entrada: number | null
          valor_financiamento: number | null
          valor_seguro: number | null
          valor_venda: number | null
          vendedor: string | null
        }
        Insert: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
          banco_financiamento?: string | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          data_entrega?: string | null
          data_venda?: string | null
          finalizado_em?: string
          hodometro?: number | null
          id: string
          modelo: string
          placa: string
          renavam?: string | null
          seguradora?: string | null
          updated_at?: string
          valor_entrada?: number | null
          valor_financiamento?: number | null
          valor_seguro?: number | null
          valor_venda?: number | null
          vendedor?: string | null
        }
        Update: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
          banco_financiamento?: string | null
          chassi?: string | null
          cor?: string | null
          created_at?: string
          data_entrega?: string | null
          data_venda?: string | null
          finalizado_em?: string
          hodometro?: number | null
          id?: string
          modelo?: string
          placa?: string
          renavam?: string | null
          seguradora?: string | null
          updated_at?: string
          valor_entrada?: number | null
          valor_financiamento?: number | null
          valor_seguro?: number | null
          valor_venda?: number | null
          vendedor?: string | null
        }
        Relationships: []
      }
      grupos_repetidos: {
        Row: {
          ano_mod: number | null
          atualizado_em: string
          cor: string
          created_at: string
          grupo_id: string
          hodometro_max: number | null
          hodometro_min: number | null
          modelo_id: string
          preco_max: number | null
          preco_min: number | null
          preco_original: number | null
          qtde: number
          updated_at: string
        }
        Insert: {
          ano_mod?: number | null
          atualizado_em?: string
          cor: string
          created_at?: string
          grupo_id?: string
          hodometro_max?: number | null
          hodometro_min?: number | null
          modelo_id: string
          preco_max?: number | null
          preco_min?: number | null
          preco_original?: number | null
          qtde?: number
          updated_at?: string
        }
        Update: {
          ano_mod?: number | null
          atualizado_em?: string
          cor?: string
          created_at?: string
          grupo_id?: string
          hodometro_max?: number | null
          hodometro_min?: number | null
          modelo_id?: string
          preco_max?: number | null
          preco_min?: number | null
          preco_original?: number | null
          qtde?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_repetidos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      log_alteracoes: {
        Row: {
          acao: string
          autor: string
          autor_cargo: string | null
          autor_email: string | null
          autor_usuario_id: string | null
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          data_hora: string
          detalhes: string | null
          em_lote: boolean
          id: string
          lote_id: string | null
          pk: string | null
          tabela: string
        }
        Insert: {
          acao: string
          autor?: string
          autor_cargo?: string | null
          autor_email?: string | null
          autor_usuario_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          data_hora?: string
          detalhes?: string | null
          em_lote?: boolean
          id?: string
          lote_id?: string | null
          pk?: string | null
          tabela: string
        }
        Update: {
          acao?: string
          autor?: string
          autor_cargo?: string | null
          autor_email?: string | null
          autor_usuario_id?: string | null
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          data_hora?: string
          detalhes?: string | null
          em_lote?: boolean
          id?: string
          lote_id?: string | null
          pk?: string | null
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_alteracoes_acao_fkey"
            columns: ["acao"]
            isOneToOne: false
            referencedRelation: "lookup_audit_actions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "log_alteracoes_autor_cargo_fkey"
            columns: ["autor_cargo"]
            isOneToOne: false
            referencedRelation: "lookup_user_roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "log_alteracoes_autor_usuario_id_fkey"
            columns: ["autor_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_announcement_statuses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_audit_actions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_locations: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_sale_statuses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_user_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_user_statuses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lookup_vehicle_states: {
        Row: {
          code: string
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      modelos: {
        Row: {
          created_at: string
          id: string
          modelo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          modelo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          modelo?: string
          updated_at?: string
        }
        Relationships: []
      }
      repetidos: {
        Row: {
          carro_id: string
          created_at: string
          grupo_id: string
          updated_at: string
        }
        Insert: {
          carro_id: string
          created_at?: string
          grupo_id: string
          updated_at?: string
        }
        Update: {
          carro_id?: string
          created_at?: string
          grupo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repetidos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: true
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repetidos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_repetidos"
            referencedColumns: ["grupo_id"]
          },
        ]
      }
      usuarios_acesso: {
        Row: {
          aprovado_em: string | null
          cargo: string
          created_at: string
          criado_em: string
          email: string | null
          foto: string | null
          id: string
          nome: string
          obs: string | null
          senha_hash: string | null
          senha_salt: string | null
          status: string
          ultimo_login: string | null
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          cargo: string
          created_at?: string
          criado_em?: string
          email?: string | null
          foto?: string | null
          id?: string
          nome: string
          obs?: string | null
          senha_hash?: string | null
          senha_salt?: string | null
          status: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          cargo?: string
          created_at?: string
          criado_em?: string
          email?: string | null
          foto?: string | null
          id?: string
          nome?: string
          obs?: string | null
          senha_hash?: string | null
          senha_salt?: string | null
          status?: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_acesso_cargo_fkey"
            columns: ["cargo"]
            isOneToOne: false
            referencedRelation: "lookup_user_roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "usuarios_acesso_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "lookup_user_statuses"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

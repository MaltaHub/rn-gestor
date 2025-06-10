export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      advertisement_insights: {
        Row: {
          created_at: string
          description: string | null
          id: string
          insight_type: string
          platform: Database["public"]["Enums"]["platform_type"] | null
          resolved: boolean
          resolved_at: string | null
          store: Database["public"]["Enums"]["store_type"]
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          insight_type: string
          platform?: Database["public"]["Enums"]["platform_type"] | null
          resolved?: boolean
          resolved_at?: string | null
          store: Database["public"]["Enums"]["store_type"]
          vehicle_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          insight_type?: string
          platform?: Database["public"]["Enums"]["platform_type"] | null
          resolved?: boolean
          resolved_at?: string | null
          store?: Database["public"]["Enums"]["store_type"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisement_insights_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisement_insights_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      advertisements: {
        Row: {
          advertised_price: number
          ativo: boolean | null
          created_at: string
          created_date: string
          data_fim: string | null
          data_inicio: string | null
          data_publicacao: string | null
          description: string | null
          id: string
          id_ancora: string
          id_origem: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          publicado: boolean | null
          publicado_por: string | null
          store: Database["public"]["Enums"]["store_type"]
          updated_at: string
          vehicle_plates: string[]
        }
        Insert: {
          advertised_price: number
          ativo?: boolean | null
          created_at?: string
          created_date?: string
          data_fim?: string | null
          data_inicio?: string | null
          data_publicacao?: string | null
          description?: string | null
          id?: string
          id_ancora: string
          id_origem?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          publicado?: boolean | null
          publicado_por?: string | null
          store?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
          vehicle_plates: string[]
        }
        Update: {
          advertised_price?: number
          ativo?: boolean | null
          created_at?: string
          created_date?: string
          data_fim?: string | null
          data_inicio?: string | null
          data_publicacao?: string | null
          description?: string | null
          id?: string
          id_ancora?: string
          id_origem?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          publicado?: boolean | null
          publicado_por?: string | null
          store?: Database["public"]["Enums"]["store_type"]
          updated_at?: string
          vehicle_plates?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_id_origem_fkey"
            columns: ["id_origem"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_id_origem_fkey"
            columns: ["id_origem"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_read_status: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean | null
          is_read: boolean
          notification_id: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_read?: boolean
          notification_id?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_read?: boolean
          notification_id?: string | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_read_status_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_read_status_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "user_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          details: string
          id: string
          message: string
          vehicle_id: string | null
          vehicle_plate: string
        }
        Insert: {
          created_at?: string
          details: string
          id?: string
          message: string
          vehicle_id?: string | null
          vehicle_plate: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          message?: string
          vehicle_id?: string | null
          vehicle_plate?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      pendency_resolutions: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          pendency_identifier: string
          pendency_type: string
          resolution_method: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          pendency_identifier: string
          pendency_type: string
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          pendency_identifier?: string
          pendency_type?: string
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      productivity_metrics: {
        Row: {
          created_at: string | null
          date: string | null
          efficiency_score: number | null
          id: string
          pendencies_resolved: number | null
          tasks_completed: number | null
          total_time_spent: unknown | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          efficiency_score?: number | null
          id?: string
          pendencies_resolved?: number | null
          tasks_completed?: number | null
          total_time_spent?: unknown | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          efficiency_score?: number | null
          id?: string
          pendencies_resolved?: number | null
          tasks_completed?: number | null
          total_time_spent?: unknown | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          components: Database["public"]["Enums"]["components"][]
          id: string
          permission_level: number
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          components: Database["public"]["Enums"]["components"][]
          id?: string
          permission_level?: number
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          components?: Database["public"]["Enums"]["components"][]
          id?: string
          permission_level?: number
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_duration: unknown | null
          assigned_at: string | null
          atribuido_para: string | null
          auto_created: boolean | null
          category: Database["public"]["Enums"]["task_category"] | null
          completed_at: string | null
          created_at: string
          description: string | null
          estimated_duration: unknown | null
          id: string
          prioridade: Database["public"]["Enums"]["prioridade_tipo"]
          source_pendency_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          store: Database["public"]["Enums"]["store_type"] | null
          title: string
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          actual_duration?: unknown | null
          assigned_at?: string | null
          atribuido_para?: string | null
          auto_created?: boolean | null
          category?: Database["public"]["Enums"]["task_category"] | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_duration?: unknown | null
          id?: string
          prioridade?: Database["public"]["Enums"]["prioridade_tipo"]
          source_pendency_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          store?: Database["public"]["Enums"]["store_type"] | null
          title: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          actual_duration?: unknown | null
          assigned_at?: string | null
          atribuido_para?: string | null
          auto_created?: boolean | null
          category?: Database["public"]["Enums"]["task_category"] | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_duration?: unknown | null
          id?: string
          prioridade?: Database["public"]["Enums"]["prioridade_tipo"]
          source_pendency_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          store?: Database["public"]["Enums"]["store_type"] | null
          title?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string
          id: string
          join_date: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          role_level: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          id: string
          join_date?: string | null
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          role_level?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          id?: string
          join_date?: string | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          role_level?: number
        }
        Relationships: []
      }
      vehicle_change_history: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string
          old_value: string | null
          vehicle_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value: string
          old_value?: string | null
          vehicle_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string
          old_value?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_change_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_change_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_images: {
        Row: {
          display_order: number
          id: string
          image_url: string
          is_cover: boolean
          store: Database["public"]["Enums"]["store_type"]
          uploaded_at: string
          uploaded_by: string | null
          vehicle_id: string
        }
        Insert: {
          display_order: number
          id?: string
          image_url: string
          is_cover?: boolean
          store?: Database["public"]["Enums"]["store_type"]
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle_id: string
        }
        Update: {
          display_order?: number
          id?: string
          image_url?: string
          is_cover?: boolean
          store?: Database["public"]["Enums"]["store_type"]
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          added_at: string
          color: string
          description: string | null
          documentacao: string | null
          fotos_rn: boolean | null
          fotos_roberto: boolean | null
          id: string
          image_url: string
          local: string | null
          mileage: number
          model: string
          plate: string
          price: number
          specifications: Json | null
          status: Database["public"]["Enums"]["vehicle_status_enum"]
          store: Database["public"]["Enums"]["store_type"]
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          year: number
        }
        Insert: {
          added_at?: string
          color: string
          description?: string | null
          documentacao?: string | null
          fotos_rn?: boolean | null
          fotos_roberto?: boolean | null
          id?: string
          image_url: string
          local?: string | null
          mileage: number
          model: string
          plate: string
          price: number
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"]
          store?: Database["public"]["Enums"]["store_type"]
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year: number
        }
        Update: {
          added_at?: string
          color?: string
          description?: string | null
          documentacao?: string | null
          fotos_rn?: boolean | null
          fotos_roberto?: boolean | null
          id?: string
          image_url?: string
          local?: string | null
          mileage?: number
          model?: string
          plate?: string
          price?: number
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"]
          store?: Database["public"]["Enums"]["store_type"]
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year?: number
        }
        Relationships: []
      }
      vendidos: {
        Row: {
          abatimento: number | null
          aprovacao_reducao: boolean | null
          carro_troca: string | null
          cpf_cliente: string
          created_at: string | null
          data_venda: string | null
          entrada: number | null
          forma_pagamento: string
          id: string
          parcelas: number | null
          seguro: boolean | null
          store: string
          valor_venda: number
          vehicle_id: string
          vendido_por: string | null
        }
        Insert: {
          abatimento?: number | null
          aprovacao_reducao?: boolean | null
          carro_troca?: string | null
          cpf_cliente: string
          created_at?: string | null
          data_venda?: string | null
          entrada?: number | null
          forma_pagamento: string
          id?: string
          parcelas?: number | null
          seguro?: boolean | null
          store: string
          valor_venda: number
          vehicle_id: string
          vendido_por?: string | null
        }
        Update: {
          abatimento?: number | null
          aprovacao_reducao?: boolean | null
          carro_troca?: string | null
          cpf_cliente?: string
          created_at?: string | null
          data_venda?: string | null
          entrada?: number | null
          forma_pagamento?: string
          id?: string
          parcelas?: number | null
          seguro?: boolean | null
          store?: string
          valor_venda?: number
          vehicle_id?: string
          vendido_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendidos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendidos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_notifications: {
        Row: {
          created_at: string | null
          details: string | null
          id: string | null
          is_hidden: boolean | null
          is_read: boolean | null
          message: string | null
          read_at: string | null
          vehicle_id: string | null
          vehicle_plate: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_history_with_user: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          field_name: string | null
          id: string | null
          name: string | null
          new_value: string | null
          old_value: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_change_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_change_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_with_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles_with_indicators: {
        Row: {
          added_at: string | null
          anuncios: Json | null
          color: string | null
          description: string | null
          documentacao: string | null
          fotos_rn: boolean | null
          fotos_roberto: boolean | null
          id: string | null
          image_url: string | null
          indicador_amarelo: boolean | null
          indicador_lilas: boolean | null
          indicador_vermelho: boolean | null
          local: string | null
          mileage: number | null
          model: string | null
          plate: string | null
          price: number | null
          specifications: Json | null
          status: Database["public"]["Enums"]["vehicle_status_enum"] | null
          store: Database["public"]["Enums"]["store_type"] | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          year: number | null
        }
        Insert: {
          added_at?: string | null
          anuncios?: never
          color?: string | null
          description?: string | null
          documentacao?: string | null
          fotos_rn?: boolean | null
          fotos_roberto?: boolean | null
          id?: string | null
          image_url?: string | null
          indicador_amarelo?: never
          indicador_lilas?: never
          indicador_vermelho?: never
          local?: string | null
          mileage?: number | null
          model?: string | null
          plate?: string | null
          price?: number | null
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"] | null
          store?: Database["public"]["Enums"]["store_type"] | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year?: number | null
        }
        Update: {
          added_at?: string | null
          anuncios?: never
          color?: string | null
          description?: string | null
          documentacao?: string | null
          fotos_rn?: boolean | null
          fotos_roberto?: boolean | null
          id?: string | null
          image_url?: string | null
          indicador_amarelo?: never
          indicador_lilas?: never
          indicador_vermelho?: never
          local?: string | null
          mileage?: number | null
          model?: string | null
          plate?: string | null
          price?: number | null
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"] | null
          store?: Database["public"]["Enums"]["store_type"] | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_advertisement_insights: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_days_advertised: {
        Args: { created_date: string }
        Returns: number
      }
      check_feature_permission: {
        Args: { user_id: string; feature_id: string }
        Returns: boolean
      }
      create_automatic_task: {
        Args: {
          p_title: string
          p_description: string
          p_vehicle_id?: string
          p_category?: Database["public"]["Enums"]["task_category"]
          p_priority?: Database["public"]["Enums"]["prioridade_tipo"]
          p_store?: Database["public"]["Enums"]["store_type"]
          p_source_pendency_id?: string
        }
        Returns: string
      }
      get_consolidated_task_state: {
        Args: Record<PropertyKey, never>
        Returns: {
          task_id: string
          title: string
          description: string
          vehicle_id: string
          category: Database["public"]["Enums"]["task_category"]
          priority: Database["public"]["Enums"]["prioridade_tipo"]
          store: Database["public"]["Enums"]["store_type"]
          status: Database["public"]["Enums"]["task_status"]
          created_at: string
          completed_at: string
          source_type: string
          source_id: string
          vehicle_plate: string
        }[]
      }
      get_permission_level: {
        Args: {
          user_id: string
          area_name: Database["public"]["Enums"]["components"]
        }
        Returns: number
      }
      has_permission: {
        Args: {
          user_id: string
          area_name: Database["public"]["Enums"]["components"]
          required_level: number
        }
        Returns: boolean
      }
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      mark_all_notifications_as_read: {
        Args: { user_id: string }
        Returns: undefined
      }
      mark_notification_as_read: {
        Args: { notification_id: string; user_id: string }
        Returns: undefined
      }
      resolve_pendency: {
        Args: {
          p_pendency_type: string
          p_pendency_identifier: string
          p_resolution_method?: string
          p_notes?: string
        }
        Returns: boolean
      }
      sync_tasks_with_current_state: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      components:
        | "view-vehicles"
        | "edit_vehicle_old"
        | "change-user"
        | "sales-operation"
        | "inventory"
        | "vehicle_details"
        | "add_vehicle"
        | "sales"
        | "sales_dashboard"
        | "advertisements"
        | "pendings"
        | "admin_panel"
        | "edit_vehicle"
      doc_stage:
        | "Recepção"
        | "Assinaturas"
        | "Digitalização Entrada"
        | "Recibo de Entrada"
        | "Recibo de Venda"
        | "Contrato de Entrada"
        | "Contrato de Venda"
        | "CRLV"
        | "Transferência"
        | "CRV"
        | "Digitalização Saida"
        | "Contrato de Repasse"
        | "Despacho"
        | "Finalizado"
      estagio:
        | "Sujo"
        | "Revisão"
        | "Vistoria"
        | "Laudo"
        | "Funilaria"
        | "Manutenção"
        | "Pintura"
        | "Pronto"
      locais:
        | "Robertão"
        | "Bailon"
        | "3ª Visão"
        | "Authêntica"
        | "Repassado"
        | "Entregue"
      platform_type:
        | "OLX"
        | "WhatsApp"
        | "Mercado Livre"
        | "Mobi Auto"
        | "ICarros"
        | "Na Pista"
        | "Cockpit"
        | "Instagram"
      prioridade_tipo: "baixa" | "normal" | "alta" | "urgente"
      store_type: "Roberto Automóveis" | "RN Multimarcas"
      task_category:
        | "photos"
        | "advertisements"
        | "documentation"
        | "maintenance"
        | "system"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      tipo_tarefa_enum: "geral" | "aprovacao_reducao" | "documentacao" | "fotos"
      user_role:
        | "Consultor"
        | "Gestor"
        | "Gerente"
        | "Administrador"
        | "Usuario"
      vehicle_status_enum: "available" | "sold" | "reserved" | "finished"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      components: [
        "view-vehicles",
        "edit_vehicle_old",
        "change-user",
        "sales-operation",
        "inventory",
        "vehicle_details",
        "add_vehicle",
        "sales",
        "sales_dashboard",
        "advertisements",
        "pendings",
        "admin_panel",
        "edit_vehicle",
      ],
      doc_stage: [
        "Recepção",
        "Assinaturas",
        "Digitalização Entrada",
        "Recibo de Entrada",
        "Recibo de Venda",
        "Contrato de Entrada",
        "Contrato de Venda",
        "CRLV",
        "Transferência",
        "CRV",
        "Digitalização Saida",
        "Contrato de Repasse",
        "Despacho",
        "Finalizado",
      ],
      estagio: [
        "Sujo",
        "Revisão",
        "Vistoria",
        "Laudo",
        "Funilaria",
        "Manutenção",
        "Pintura",
        "Pronto",
      ],
      locais: [
        "Robertão",
        "Bailon",
        "3ª Visão",
        "Authêntica",
        "Repassado",
        "Entregue",
      ],
      platform_type: [
        "OLX",
        "WhatsApp",
        "Mercado Livre",
        "Mobi Auto",
        "ICarros",
        "Na Pista",
        "Cockpit",
        "Instagram",
      ],
      prioridade_tipo: ["baixa", "normal", "alta", "urgente"],
      store_type: ["Roberto Automóveis", "RN Multimarcas"],
      task_category: [
        "photos",
        "advertisements",
        "documentation",
        "maintenance",
        "system",
      ],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      tipo_tarefa_enum: ["geral", "aprovacao_reducao", "documentacao", "fotos"],
      user_role: ["Consultor", "Gestor", "Gerente", "Administrador", "Usuario"],
      vehicle_status_enum: ["available", "sold", "reserved", "finished"],
    },
  },
} as const

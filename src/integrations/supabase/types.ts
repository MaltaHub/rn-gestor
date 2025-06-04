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
        ]
      }
      role_permissions: {
        Row: {
          component: Database["public"]["Enums"]["components"]
          id: string
          permission_level: number
          position: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          component: Database["public"]["Enums"]["components"]
          id?: string
          permission_level?: number
          position: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          component?: Database["public"]["Enums"]["components"]
          id?: string
          permission_level?: number
          position?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean
          created_at: string
          description: string | null
          field_value: string | null
          id: string
          related_field: string | null
          title: string
          vehicle_id: string | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          description?: string | null
          field_value?: string | null
          id?: string
          related_field?: string | null
          title: string
          vehicle_id?: string | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          description?: string | null
          field_value?: string | null
          id?: string
          related_field?: string | null
          title?: string
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
        ]
      }
      vehicle_images: {
        Row: {
          display_order: number
          id: string
          image_url: string
          is_cover: boolean
          uploaded_at: string
          uploaded_by: string | null
          vehicle_id: string
        }
        Insert: {
          display_order: number
          id?: string
          image_url: string
          is_cover?: boolean
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle_id: string
        }
        Update: {
          display_order?: number
          id?: string
          image_url?: string
          is_cover?: boolean
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
        ]
      }
      vehicles: {
        Row: {
          added_at: string
          color: string
          description: string | null
          id: string
          image_url: string
          mileage: number
          model: string
          plate: string
          price: number
          specifications: Json | null
          status: Database["public"]["Enums"]["vehicle_status_enum"]
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          year: number
        }
        Insert: {
          added_at?: string
          color: string
          description?: string | null
          id?: string
          image_url: string
          mileage: number
          model: string
          plate: string
          price: number
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"]
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year: number
        }
        Update: {
          added_at?: string
          color?: string
          description?: string | null
          id?: string
          image_url?: string
          mileage?: number
          model?: string
          plate?: string
          price?: number
          specifications?: Json | null
          status?: Database["public"]["Enums"]["vehicle_status_enum"]
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          year?: number
        }
        Relationships: []
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
        ]
      }
    }
    Functions: {
      check_feature_permission: {
        Args: { user_id: string; feature_id: string }
        Returns: boolean
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
      mark_all_notifications_as_read: {
        Args: { user_id: string }
        Returns: undefined
      }
      mark_notification_as_read: {
        Args: { notification_id: string; user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      components: "view_vehicles" | "edit-vehicle" | "change_user"
      user_role:
        | "Consultor"
        | "Gestor"
        | "Gerente"
        | "Administrador"
        | "Usuario"
      vehicle_status_enum: "available" | "sold" | "reserved"
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
      components: ["view_vehicles", "edit-vehicle", "change_user"],
      user_role: ["Consultor", "Gestor", "Gerente", "Administrador", "Usuario"],
      vehicle_status_enum: ["available", "sold", "reserved"],
    },
  },
} as const

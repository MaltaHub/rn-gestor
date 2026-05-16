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
          anuncio_legado: boolean
          carro_id: string
          created_at: string
          descricao: string | null
          estado_anuncio: string
          id: string
          id_anuncio_legado: string | null
          no_instagram: boolean
          updated_at: string
          valor_anuncio: number | null
        }
        Insert: {
          anuncio_legado?: boolean
          carro_id: string
          created_at?: string
          descricao?: string | null
          estado_anuncio?: string
          id?: string
          id_anuncio_legado?: string | null
          no_instagram?: boolean
          updated_at?: string
          valor_anuncio?: number | null
        }
        Update: {
          anuncio_legado?: boolean
          carro_id?: string
          created_at?: string
          descricao?: string | null
          estado_anuncio?: string
          id?: string
          id_anuncio_legado?: string | null
          no_instagram?: boolean
          updated_at?: string
          valor_anuncio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: true
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_estado_anuncio_fkey"
            columns: ["estado_anuncio"]
            isOneToOne: false
            referencedRelation: "lookup_announcement_statuses"
            referencedColumns: ["code"]
          },
        ]
      }
      anuncios_insight_verifications: {
        Row: {
          anuncio_id: string
          insight_code: string
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          anuncio_id: string
          insight_code: string
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          anuncio_id?: string
          insight_code?: string
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_insight_verifications_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_insight_verifications_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios_operational_insights"
            referencedColumns: ["anuncio_id"]
          },
          {
            foreignKeyName: "anuncios_insight_verifications_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "anuncios_price_insights"
            referencedColumns: ["anuncio_id"]
          },
          {
            foreignKeyName: "anuncios_insight_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivo_automacao_config: {
        Row: {
          automation_key: string
          created_at: string
          display_field: string
          enabled: boolean
          repository_folder_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          automation_key: string
          created_at?: string
          display_field?: string
          enabled?: boolean
          repository_folder_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          automation_key?: string
          created_at?: string
          display_field?: string
          enabled?: boolean
          repository_folder_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivo_automacao_config_repository_folder_id_fkey"
            columns: ["repository_folder_id"]
            isOneToOne: false
            referencedRelation: "arquivos_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivo_automacao_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivo_automacao_folders: {
        Row: {
          archived_at: string | null
          automation_key: string
          carro_id: string | null
          created_at: string
          entity_snapshot: Json
          folder_id: string
          id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          automation_key: string
          carro_id?: string | null
          created_at?: string
          entity_snapshot?: Json
          folder_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          automation_key?: string
          carro_id?: string | null
          created_at?: string
          entity_snapshot?: Json
          folder_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivo_automacao_folders_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivo_automacao_folders_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "arquivos_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos_arquivos: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          mime_type: string
          nome_arquivo: string
          pasta_id: string
          sort_order: number
          storage_path: string
          tamanho_bytes: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          mime_type: string
          nome_arquivo: string
          pasta_id: string
          sort_order?: number
          storage_path: string
          tamanho_bytes: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          nome_arquivo?: string
          pasta_id?: string
          sort_order?: number
          storage_path?: string
          tamanho_bytes?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_arquivos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "arquivos_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_arquivos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos_pastas: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          nome_slug: string
          parent_folder_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          nome_slug: string
          parent_folder_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          nome_slug?: string
          parent_folder_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_pastas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_pastas_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "arquivos_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_pastas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
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
          local: string
          modelo_id: string
          nome: string | null
          os_supply_appscript_check: boolean
          placa: string
          preco_original: number | null
          renavam: string | null
          tem_chave_r: boolean | null
          tem_fotos: boolean
          tem_manual: boolean | null
          ultima_alteracao: string
          updated_at: string
        }
        Insert: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
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
          local: string
          modelo_id: string
          nome?: string | null
          os_supply_appscript_check?: boolean
          placa: string
          preco_original?: number | null
          renavam?: string | null
          tem_chave_r?: boolean | null
          tem_fotos?: boolean
          tem_manual?: boolean | null
          ultima_alteracao?: string
          updated_at?: string
        }
        Update: {
          ano_fab?: number | null
          ano_ipva_pago?: number | null
          ano_mod?: number | null
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
          local?: string
          modelo_id?: string
          nome?: string | null
          os_supply_appscript_check?: boolean
          placa?: string
          preco_original?: number | null
          renavam?: string | null
          tem_chave_r?: boolean | null
          tem_fotos?: boolean
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
      documentos: {
        Row: {
          carro_id: string
          created_at: string
          doc_entrada: boolean
          envelope: boolean
          nota_entrada: number | null
          nota_saida: number | null
          observacao: string | null
          pericia: boolean
          responsavel: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          carro_id: string
          created_at?: string
          doc_entrada?: boolean
          envelope?: boolean
          nota_entrada?: number | null
          nota_saida?: number | null
          observacao?: string | null
          pericia?: boolean
          responsavel?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          carro_id?: string
          created_at?: string
          doc_entrada?: boolean
          envelope?: boolean
          nota_entrada?: number | null
          nota_saida?: number | null
          observacao?: string | null
          pericia?: boolean
          responsavel?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: true
            referencedRelation: "carros"
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
          ano_fab: number | null
          ano_mod: number | null
          atualizado_em: string
          caracteristicas_visuais_ids: string[]
          caracteristicas_visuais_resumo: string
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
          ano_fab?: number | null
          ano_mod?: number | null
          atualizado_em?: string
          caracteristicas_visuais_ids?: string[]
          caracteristicas_visuais_resumo?: string
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
          ano_fab?: number | null
          ano_mod?: number | null
          atualizado_em?: string
          caracteristicas_visuais_ids?: string[]
          caracteristicas_visuais_resumo?: string
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
      price_change_contexts: {
        Row: {
          column_name: string
          context: string
          created_at: string
          created_by: string | null
          id: string
          new_value: number | null
          old_value: number | null
          row_id: string
          table_name: string
        }
        Insert: {
          column_name: string
          context: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_value?: number | null
          old_value?: number | null
          row_id: string
          table_name: string
        }
        Update: {
          column_name?: string
          context?: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_value?: number | null
          old_value?: number | null
          row_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_change_contexts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios_acesso"
            referencedColumns: ["id"]
          },
        ]
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
          auth_user_id: string | null
          cargo: string
          created_at: string
          criado_em: string
          email: string | null
          foto: string | null
          id: string
          nome: string
          obs: string | null
          status: string
          ultimo_login: string | null
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          auth_user_id?: string | null
          cargo: string
          created_at?: string
          criado_em?: string
          email?: string | null
          foto?: string | null
          id?: string
          nome: string
          obs?: string | null
          status: string
          ultimo_login?: string | null
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          auth_user_id?: string | null
          cargo?: string
          created_at?: string
          criado_em?: string
          email?: string | null
          foto?: string | null
          id?: string
          nome?: string
          obs?: string | null
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
      vendas: {
        Row: {
          carro_id: string
          comprador_documento: string | null
          comprador_email: string | null
          comprador_endereco: string | null
          comprador_nome: string
          comprador_telefone: string | null
          created_at: string
          created_by_user_id: string | null
          data_venda: string
          estado_venda: string
          financ_banco: string | null
          financ_parcela_valor: number | null
          financ_parcelas_qtde: number | null
          financ_primeira_em: string | null
          financ_taxa_mensal: number | null
          forma_pagamento: string
          id: string
          observacao: string | null
          seguro_apolice: string | null
          seguro_seguradora: string | null
          seguro_validade: string | null
          seguro_valor: number | null
          troca_ano: number | null
          troca_marca: string | null
          troca_modelo: string | null
          troca_placa: string | null
          troca_valor: number | null
          updated_at: string
          valor_entrada: number | null
          valor_total: number
          vendedor_auth_user_id: string
        }
        Insert: {
          carro_id: string
          comprador_documento?: string | null
          comprador_email?: string | null
          comprador_endereco?: string | null
          comprador_nome: string
          comprador_telefone?: string | null
          created_at?: string
          created_by_user_id?: string | null
          data_venda?: string
          estado_venda?: string
          financ_banco?: string | null
          financ_parcela_valor?: number | null
          financ_parcelas_qtde?: number | null
          financ_primeira_em?: string | null
          financ_taxa_mensal?: number | null
          forma_pagamento: string
          id?: string
          observacao?: string | null
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_validade?: string | null
          seguro_valor?: number | null
          troca_ano?: number | null
          troca_marca?: string | null
          troca_modelo?: string | null
          troca_placa?: string | null
          troca_valor?: number | null
          updated_at?: string
          valor_entrada?: number | null
          valor_total: number
          vendedor_auth_user_id: string
        }
        Update: {
          carro_id?: string
          comprador_documento?: string | null
          comprador_email?: string | null
          comprador_endereco?: string | null
          comprador_nome?: string
          comprador_telefone?: string | null
          created_at?: string
          created_by_user_id?: string | null
          data_venda?: string
          estado_venda?: string
          financ_banco?: string | null
          financ_parcela_valor?: number | null
          financ_parcelas_qtde?: number | null
          financ_primeira_em?: string | null
          financ_taxa_mensal?: number | null
          forma_pagamento?: string
          id?: string
          observacao?: string | null
          seguro_apolice?: string | null
          seguro_seguradora?: string | null
          seguro_validade?: string | null
          seguro_valor?: number | null
          troca_ano?: number | null
          troca_marca?: string | null
          troca_modelo?: string | null
          troca_placa?: string | null
          troca_valor?: number | null
          updated_at?: string
          valor_entrada?: number | null
          valor_total?: number
          vendedor_auth_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: false
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      anuncios_missing_reference: {
        Row: {
          ano_fab: number | null
          ano_mod: number | null
          carro_id: string | null
          cor: string | null
          criterio_referencia: string | null
          grid_row_id: string | null
          grupo_id: string | null
          insight_code: string | null
          insight_message: string | null
          local: string | null
          modelo_id: string | null
          nome: string | null
          origem_repetido: boolean | null
          placa: string | null
          preco_carro_atual: number | null
        }
        Relationships: []
      }
      anuncios_operational_insights: {
        Row: {
          anuncio_id: string | null
          carro_id: string | null
          delete_recommended: boolean | null
          has_group_duplicate_ads: boolean | null
          has_pending_action: boolean | null
          insight_code: string | null
          insight_message: string | null
          preco_carro_atual: number | null
          replace_recommended: boolean | null
          replacement_carro_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: true
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios_price_insights: {
        Row: {
          anuncio_id: string | null
          carro_id: string | null
          has_pending_action: boolean | null
          insight_code: string | null
          insight_message: string | null
          preco_carro_atual: number | null
          valor_anuncio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_carro_id_fkey"
            columns: ["carro_id"]
            isOneToOne: true
            referencedRelation: "carros"
            referencedColumns: ["id"]
          },
        ]
      }
      anuncios_referencia: {
        Row: {
          ano_fab: number | null
          ano_mod: number | null
          carro_id: string | null
          carros_grupo_qtde: number | null
          carros_mesmo_preco: number | null
          cor: string | null
          criterio_referencia: string | null
          grupo_id: string | null
          local: string | null
          modelo_id: string | null
          nome: string | null
          origem_repetido: boolean | null
          placa: string | null
          preco_original: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      dispatch_supply_carros_payload: {
        Args: { payload: Json }
        Returns: boolean
      }
      display_repetidos_cor: { Args: { p_cor: string }; Returns: string }
      is_carro_disponivel_ou_novo: {
        Args: { p_estado_venda: string }
        Returns: boolean
      }
      normalize_business_token: { Args: { p_value: string }; Returns: string }
      normalize_repetidos_cor: { Args: { p_cor: string }; Returns: string }
      refresh_anuncios_reference_projection: { Args: never; Returns: number }
      refresh_repetidos_projection: {
        Args: never
        Returns: {
          grupos_repetidos: number
          registros_repetidos: number
        }[]
      }
      refresh_repetidos_projection_for_carro: {
        Args: { p_carro_id: string }
        Returns: {
          grupos_repetidos: number
          registros_repetidos: number
        }[]
      }
      refresh_repetidos_projection_group: {
        Args: {
          p_ano_fab: number
          p_ano_mod: number
          p_cor: string
          p_modelo_id: string
        }
        Returns: {
          grupos_repetidos: number
          registros_repetidos: number
        }[]
      }
      resolve_carro_estado_anuncio: {
        Args: { p_carro_id: string }
        Returns: string
      }
      resolve_carro_repetido_grupo_id: {
        Args: { p_carro_id: string }
        Returns: string
      }
      sync_carros_estado_anuncio: {
        Args: { p_carro_ids?: string[] }
        Returns: number
      }
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

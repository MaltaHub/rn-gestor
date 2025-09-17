import type { Database } from "@/integrations/supabase/types";

export type ConfigurationCategory = Database["public"]["Enums"]["configuration_category"];
export type StoreTypeEnum = Database["public"]["Enums"]["store_type"];

export interface ConfigurationItem {
  id: string;
  category: ConfigurationCategory;
  name: string;
  value: string;
  description: string | null;
  store: StoreTypeEnum | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ConfigurationItemInput = Pick<ConfigurationItem, "category" | "name" | "value"> & {
  description?: string | null;
  store?: StoreTypeEnum | null;
  metadata?: Record<string, unknown> | null;
  sort_order?: number;
  is_active?: boolean;
};

export type ConfigurationItemUpdate = Partial<{
  name: string;
  value: string;
  description: string | null;
  store: StoreTypeEnum | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  is_active: boolean;
}>;

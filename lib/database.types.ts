// 자동 생성 파일. 직접 고치지 말 것.
// 스키마를 바꾼 뒤 다시 만들려면:
//   npx supabase gen types typescript --project-id jnacpoqvnajjjfwwotnw > lib/database.types.ts

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          default_low_stock: number
          id: boolean
          store_name: string
          updated_at: string
        }
        Insert: {
          default_low_stock?: number
          id?: boolean
          store_name?: string
          updated_at?: string
        }
        Update: {
          default_low_stock?: number
          id?: boolean
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      barcodes: {
        Row: {
          code: string
          created_at: string
          is_primary: boolean
          label: string | null
          variant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          is_primary?: boolean
          label?: string | null
          variant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          is_primary?: boolean
          label?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barcodes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "barcodes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_stock_integrity"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "barcodes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "barcodes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["category_id"]
          },
        ]
      }
      kit_items: {
        Row: {
          default_qty: number
          kit_id: string
          sort_order: number
          variant_id: string
        }
        Insert: {
          default_qty: number
          kit_id: string
          sort_order?: number
          variant_id: string
        }
        Update: {
          default_qty?: number
          kit_id?: string
          sort_order?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          import_batch_id: string | null
          is_active: boolean
          name: string
          option_schema: Json
          pos_name: string | null
          purchase_unit_name: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          is_active?: boolean
          name: string
          option_schema?: Json
          pos_name?: string | null
          purchase_unit_name?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          is_active?: boolean
          name?: string
          option_schema?: Json
          pos_name?: string | null
          purchase_unit_name?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["category_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sale_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          import_fingerprint: string | null
          item_count: number
          memo: string | null
          occurred_at: string
          source: string
          total_cost: number
          total_revenue: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          import_fingerprint?: string | null
          item_count?: number
          memo?: string | null
          occurred_at?: string
          source?: string
          total_cost?: number
          total_revenue?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          import_fingerprint?: string | null
          item_count?: number
          memo?: string | null
          occurred_at?: string
          source?: string
          total_cost?: number
          total_revenue?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          cost_amount: number | null
          counted_qty: number | null
          created_at: string
          created_by: string | null
          id: number
          note: string | null
          occurred_at: string
          purchase_amount: number | null
          qty_delta: number
          revenue_amount: number | null
          reverses_id: number | null
          sale_order_id: string | null
          stock_after: number
          supplier_id: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost: number | null
          unit_price: number | null
          variant_id: string
        }
        Insert: {
          cost_amount?: number | null
          counted_qty?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          occurred_at?: string
          purchase_amount?: number | null
          qty_delta: number
          revenue_amount?: number | null
          reverses_id?: number | null
          sale_order_id?: string | null
          stock_after: number
          supplier_id?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number | null
          unit_price?: number | null
          variant_id: string
        }
        Update: {
          cost_amount?: number | null
          counted_qty?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          note?: string | null
          occurred_at?: string
          purchase_amount?: number | null
          qty_delta?: number
          revenue_amount?: number | null
          reverses_id?: number | null
          sale_order_id?: string | null
          stock_after?: number
          supplier_id?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          unit_cost?: number | null
          unit_price?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "v_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_stock_integrity"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          memo: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          memo?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          memo?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      variants: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          options: Json
          product_id: string
          sale_price: number
          sku: string | null
          stock_qty: number
          units_per_pack: number | null
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          options?: Json
          product_id: string
          sale_price?: number
          sku?: string | null
          stock_qty?: number
          units_per_pack?: number | null
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          options?: Json
          product_id?: string
          sale_price?: number
          sku?: string | null
          stock_qty?: number
          units_per_pack?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_movements"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["product_id"]
          },
        ]
      }
    }
    Views: {
      v_daily_sales: {
        Row: {
          cogs: number | null
          margin: number | null
          order_count: number | null
          qty_sold: number | null
          revenue: number | null
          sale_date: string | null
        }
        Relationships: []
      }
      v_kit_items: {
        Row: {
          cost_price: number | null
          default_qty: number | null
          kit_id: string | null
          option_label: string | null
          pos_name: string | null
          product_active: boolean | null
          product_id: string | null
          product_name: string | null
          sale_price: number | null
          sort_order: number | null
          stock_qty: number | null
          unit: string | null
          variant_active: boolean | null
          variant_id: string | null
        }
        Relationships: []
      }
      v_kits: {
        Row: {
          default_total_qty: number | null
          is_active: boolean | null
          item_count: number | null
          kit_id: string | null
          name: string | null
          note: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_low_stock: {
        Row: {
          barcode: string | null
          category_id: string | null
          category_name: string | null
          channel: string | null
          cost_price: number | null
          is_active: boolean | null
          is_low_stock: boolean | null
          is_negative: boolean | null
          low_stock_threshold: number | null
          margin_rate: number | null
          option_label: string | null
          options: Json | null
          pos_name: string | null
          product_active: boolean | null
          product_id: string | null
          product_name: string | null
          purchase_unit_name: string | null
          sale_price: number | null
          sku: string | null
          stock_qty: number | null
          stock_value: number | null
          unit: string | null
          unit_margin: number | null
          units_per_pack: number | null
          updated_at: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      v_movements: {
        Row: {
          category_name: string | null
          counted_qty: number | null
          created_by: string | null
          created_by_name: string | null
          id: number | null
          note: string | null
          occurred_at: string | null
          option_label: string | null
          product_id: string | null
          product_name: string | null
          purchase_amount: number | null
          qty_delta: number | null
          revenue_amount: number | null
          reverses_id: number | null
          sale_order_id: string | null
          sku: string | null
          stock_after: number | null
          supplier_id: string | null
          supplier_name: string | null
          type: Database["public"]["Enums"]["stock_movement_type"] | null
          unit: string | null
          unit_cost: number | null
          unit_price: number | null
          variant_id: string | null
          voided_by: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "v_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_stock_integrity"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_integrity: {
        Row: {
          cached_qty: number | null
          drift: number | null
          ledger_qty: number | null
          product_name: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      v_stock_valuation: {
        Row: {
          total_cost_value: number | null
          total_qty: number | null
          total_retail_value: number | null
          variant_count: number | null
        }
        Relationships: []
      }
      v_variant_stock: {
        Row: {
          barcode: string | null
          category_id: string | null
          category_name: string | null
          channel: string | null
          cost_price: number | null
          is_active: boolean | null
          is_low_stock: boolean | null
          is_negative: boolean | null
          low_stock_threshold: number | null
          margin_rate: number | null
          option_label: string | null
          options: Json | null
          pos_name: string | null
          product_active: boolean | null
          product_id: string | null
          product_name: string | null
          purchase_unit_name: string | null
          sale_price: number | null
          sku: string | null
          stock_qty: number | null
          stock_value: number | null
          unit: string | null
          unit_margin: number | null
          units_per_pack: number | null
          updated_at: string | null
          variant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_product: {
        Args: {
          p_category_id?: string
          p_channel?: string
          p_description?: string
          p_name: string
          p_option_schema?: Json
          p_pos_name?: string
          p_purchase_unit_name?: string
          p_unit?: string
          p_variants?: Json
        }
        Returns: string
      }
      fn_option_label: {
        Args: { p_options: Json; p_schema: Json }
        Returns: string
      }
      import_products: {
        Args: { p_products: Json }
        Returns: {
          batch_id: string
          product_id: string
          product_name: string
        }[]
      }
      import_sales: {
        Args: { p_force?: boolean; p_groups: Json; p_memo?: string }
        Returns: {
          batch_id: string
          item_count: number
          occurred_at: string
          order_id: string
          revenue: number
        }[]
      }
      lookup_by_barcode: {
        Args: { p_code: string }
        Returns: {
          barcode: string
          cost_price: number
          option_label: string
          product_id: string
          product_name: string
          sale_price: number
          stock_qty: number
          unit: string
          variant_id: string
        }[]
      }
      recalc_stock: { Args: { p_variant_id?: string }; Returns: number }
      receive_kit: {
        Args: {
          p_box_cost?: number
          p_boxes?: number
          p_kit_id: string
          p_lines: Json
          p_note?: string
          p_occurred_at?: string
          p_supplier_id?: string
        }
        Returns: {
          product_name: string
          qty: number
          stock_after: number
          unit_cost: number
          variant_id: string
        }[]
      }
      record_sale: {
        Args: { p_items: Json; p_memo?: string; p_occurred_at?: string }
        Returns: string
      }
      record_stock_movement: {
        Args: {
          p_note?: string
          p_occurred_at?: string
          p_qty: number
          p_supplier_id?: string
          p_type: Database["public"]["Enums"]["stock_movement_type"]
          p_unit_cost?: number
          p_variant_id: string
        }
        Returns: number
      }
      record_stocktake: {
        Args: { p_counted_qty: number; p_note?: string; p_variant_id: string }
        Returns: number
      }
      stats_by_category: {
        Args: { p_from: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          margin: number
          margin_rate: number
          qty_sold: number
          revenue: number
          revenue_share: number
        }[]
      }
      stats_by_supplier: {
        Args: { p_from: string; p_to: string }
        Returns: {
          purchase_amount: number
          purchase_count: number
          qty_purchased: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      stats_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_order_value: number
          cogs: number
          margin: number
          margin_rate: number
          order_count: number
          qty_sold: number
          revenue: number
        }[]
      }
      stats_top_products: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: {
          category_name: string
          margin: number
          margin_rate: number
          option_label: string
          product_id: string
          product_name: string
          qty_sold: number
          revenue: number
          variant_id: string
        }[]
      }
      stats_turnover: {
        Args: { p_from: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          days_of_stock: number
          period_cogs: number
          stock_value_now: number
          turnover_annual: number
        }[]
      }
      update_product: {
        Args: {
          p_category_id?: string
          p_channel?: string
          p_description?: string
          p_name: string
          p_pos_name?: string
          p_product_id: string
          p_purchase_unit_name?: string
          p_unit?: string
          p_variants?: Json
        }
        Returns: undefined
      }
      upsert_kit: {
        Args: {
          p_items?: Json
          p_kit_id: string | null
          p_name: string
          p_note?: string
        }
        Returns: string
      }
      void_import_batch: {
        Args: { p_batch_id: string; p_reason?: string }
        Returns: number
      }
      void_movement: {
        Args: { p_id: number; p_reason?: string }
        Returns: number
      }
      void_product_import: {
        Args: { p_batch_id: string; p_reason?: string }
        Returns: number
      }
      void_sale_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: number
      }
    }
    Enums: {
      stock_movement_type:
        | "purchase"
        | "outbound"
        | "sale"
        | "adjustment"
        | "stocktake"
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
    Enums: {
      stock_movement_type: [
        "purchase",
        "outbound",
        "sale",
        "adjustment",
        "stocktake",
      ],
    },
  },
} as const

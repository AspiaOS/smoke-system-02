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
      admin_allowlist: {
        Row: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          payload: Json | null
          store_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          payload?: Json | null
          store_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          payload?: Json | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          store_id: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          store_id: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          internal_notes: string | null
          last_address: string | null
          last_neighborhood: string | null
          name: string
          phone: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          last_address?: string | null
          last_neighborhood?: string | null
          name: string
          phone: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_notes?: string | null
          last_address?: string | null
          last_neighborhood?: string | null
          name?: string
          phone?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          store_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          store_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      neighborhoods: {
        Row: {
          active: boolean
          created_at: string
          delivery_fee: number
          id: string
          name: string
          store_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_fee: number
          id?: string
          name: string
          store_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_fee?: number
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "neighborhoods_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: number
          line_total: number
          order_id: string
          product_name: string
          quantity: number
          unit_price: number
          variation_id: string
          variation_name: string
        }
        Insert: {
          id?: never
          line_total: number
          order_id: string
          product_name: string
          quantity: number
          unit_price: number
          variation_id: string
          variation_name: string
        }
        Update: {
          id?: never
          line_total?: number
          order_id?: string
          product_name?: string
          quantity?: number
          unit_price?: number
          variation_id?: string
          variation_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "public_catalog"
            referencedColumns: ["variation_id"]
          },
          {
            foreignKeyName: "order_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "variations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          address: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivery_fee: number
          id: string
          neighborhood_name: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
        }
        Insert: {
          accepted_at?: string | null
          address: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivery_fee: number
          id?: string
          neighborhood_name: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number
        }
        Update: {
          accepted_at?: string | null
          address?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_fee?: number
          id?: string
          neighborhood_name?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category_id: string
          created_at: string
          description: string | null
          featured: boolean
          id: string
          images: string[]
          name: string
          store_id: string
          updated_at: string
          video_url: string | null
          visible: boolean
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category_id: string
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          images?: string[]
          name: string
          store_id: string
          updated_at?: string
          video_url?: string | null
          visible?: boolean
        }
        Update: {
          active?: boolean
          brand?: string | null
          category_id?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          images?: string[]
          name?: string
          store_id?: string
          updated_at?: string
          video_url?: string | null
          visible?: boolean
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
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          hit_at: string
          id: number
          key: string
        }
        Insert: {
          bucket: string
          hit_at?: string
          id?: number
          key: string
        }
        Update: {
          bucket?: string
          hit_at?: string
          id?: number
          key?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          delivery_fee: number
          gross_profit: number
          id: string
          order_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          store_id: string
          subtotal: number
          total: number
          total_cost: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          delivery_fee: number
          gross_profit: number
          id?: string
          order_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          store_id: string
          subtotal: number
          total: number
          total_cost: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          delivery_fee?: number
          gross_profit?: number
          id?: string
          order_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          store_id?: string
          subtotal?: number
          total?: number
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: string | null
          qty_after: number
          qty_before: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          variation_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          order_id?: string | null
          qty_after: number
          qty_before: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          variation_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          order_id?: string | null
          qty_after?: number
          qty_before?: number
          type?: Database["public"]["Enums"]["stock_movement_type"]
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "public_catalog"
            referencedColumns: ["variation_id"]
          },
          {
            foreignKeyName: "stock_movements_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "variations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          banners: Json
          store_display_name: string
          store_id: string
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          banners?: Json
          store_display_name: string
          store_id: string
          updated_at?: string
          whatsapp_number?: string
        }
        Update: {
          banners?: Json
          store_display_name?: string
          store_id?: string
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variations: {
        Row: {
          active: boolean
          cost: number
          created_at: string
          id: string
          min_stock: number
          name: string
          price: number
          product_id: string
          reserved_quantity: number
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          price: number
          product_id: string
          reserved_quantity?: number
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          price?: number
          product_id?: string
          reserved_quantity?: number
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_catalog"
            referencedColumns: ["product_id"]
          },
        ]
      }
    }
    Views: {
      public_catalog: {
        Row: {
          brand: string | null
          category_id: string | null
          category_name: string | null
          description: string | null
          featured: boolean | null
          images: string[] | null
          in_stock: boolean | null
          price: number | null
          product_id: string | null
          product_name: string | null
          variation_id: string | null
          variation_name: string | null
          video_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      public_store_settings: {
        Row: {
          banners: Json | null
          store_display_name: string | null
          store_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          banners?: Json | null
          store_display_name?: string | null
          store_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          banners?: Json | null
          store_display_name?: string | null
          store_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_order: { Args: { p_order_id: string }; Returns: string }
      cancel_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _key: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      create_public_order: {
        Args: {
          p_address: string
          p_customer_name: string
          p_customer_phone: string
          p_items: Json
          p_neighborhood_id: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: {
          address: string
          customer_name: string
          customer_phone: string
          delivery_fee: number
          neighborhood_name: string
          order_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          subtotal: number
          total: number
          whatsapp_number: string
        }[]
      }
      current_store_id: { Args: never; Returns: string }
      expire_pending_orders: { Args: { _older_than?: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner: { Args: never; Returns: boolean }
      stock_adjust: {
        Args: { _new_qty: number; _note: string; _variation_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: string | null
          qty_after: number
          qty_before: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          variation_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stock_entry: {
        Args: { _note?: string; _qty: number; _variation_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: string | null
          qty_after: number
          qty_before: number
          type: Database["public"]["Enums"]["stock_movement_type"]
          variation_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      variation_store_id: { Args: { _variation_id: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "manager" | "seller" | "stock_operator"
      order_status: "pending" | "accepted" | "cancelled"
      payment_method: "pix" | "cash" | "debit" | "credit"
      stock_movement_type: "entry" | "adjustment" | "sale_accept"
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
      app_role: ["owner", "manager", "seller", "stock_operator"],
      order_status: ["pending", "accepted", "cancelled"],
      payment_method: ["pix", "cash", "debit", "credit"],
      stock_movement_type: ["entry", "adjustment", "sale_accept"],
    },
  },
} as const

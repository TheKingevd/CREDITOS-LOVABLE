export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      credit_movements: {
        Row: { created_at: string; created_by: string | null; delta: number; id: string; note: string | null; reason: string; reseller_id: string }
        Insert: { created_at?: string; created_by?: string | null; delta: number; id?: string; note?: string | null; reason?: string; reseller_id: string }
        Update: { created_at?: string; created_by?: string | null; delta?: number; id?: string; note?: string | null; reason?: string; reseller_id?: string }
        Relationships: [{ foreignKeyName: "credit_movements_reseller_id_fkey"; columns: ["reseller_id"]; isOneToOne: false; referencedRelation: "resellers"; referencedColumns: ["id"] }]
      }
      plans: {
        Row: { active: boolean; created_at: string; credits: number; description: string | null; features: string[]; highlight: boolean; id: string; name: string; price_cents: number; promo_label: string | null; promo_price_cents: number | null; sort_order: number; updated_at: string }
        Insert: { active?: boolean; created_at?: string; credits?: number; description?: string | null; features?: string[]; highlight?: boolean; id?: string; name: string; price_cents?: number; promo_label?: string | null; promo_price_cents?: number | null; sort_order?: number; updated_at?: string }
        Update: { active?: boolean; created_at?: string; credits?: number; description?: string | null; features?: string[]; highlight?: boolean; id?: string; name?: string; price_cents?: number; promo_label?: string | null; promo_price_cents?: number | null; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { created_at: string; email: string | null; full_name: string | null; id: string }
        Insert: { created_at?: string; email?: string | null; full_name?: string | null; id: string }
        Update: { created_at?: string; email?: string | null; full_name?: string | null; id?: string }
        Relationships: []
      }
      resellers: {
        Row: { active: boolean; commission_pct: number; created_at: string; credits_balance: number; document: string | null; email: string; id: string; name: string; phone: string | null; updated_at: string; user_id: string | null }
        Insert: { active?: boolean; commission_pct?: number; created_at?: string; credits_balance?: number; document?: string | null; email: string; id?: string; name: string; phone?: string | null; updated_at?: string; user_id?: string | null }
        Update: { active?: boolean; commission_pct?: number; created_at?: string; credits_balance?: number; document?: string | null; email?: string; id?: string; name?: string; phone?: string | null; updated_at?: string; user_id?: string | null }
        Relationships: []
      }
      sales: {
        Row: { amount_cents: number; commission_cents: number; created_at: string; created_by: string | null; credits: number; customer_document: string | null; customer_email: string | null; customer_name: string; customer_phone: string | null; id: string; note: string | null; payment_method: string; plan_id: string | null; plan_name: string; reseller_id: string; status: string }
        Insert: { amount_cents?: number; commission_cents?: number; created_at?: string; created_by?: string | null; credits?: number; customer_document?: string | null; customer_email?: string | null; customer_name: string; customer_phone?: string | null; id?: string; note?: string | null; payment_method?: string; plan_id?: string | null; plan_name: string; reseller_id: string; status?: string }
        Update: { amount_cents?: number; commission_cents?: number; created_at?: string; created_by?: string | null; credits?: number; customer_document?: string | null; customer_email?: string | null; customer_name?: string; customer_phone?: string | null; id?: string; note?: string | null; payment_method?: string; plan_id?: string | null; plan_name?: string; reseller_id?: string; status?: string }
        Relationships: [
          { foreignKeyName: "sales_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["id"] },
          { foreignKeyName: "sales_reseller_id_fkey"; columns: ["reseller_id"]; isOneToOne: false; referencedRelation: "resellers"; referencedColumns: ["id"] },
        ]
      }
      user_roles: {
        Row: { created_at: string; id: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Insert: { created_at?: string; id?: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Update: { created_at?: string; id?: string; role?: Database["public"]["Enums"]["app_role"]; user_id?: string }
        Relationships: []
      }
      asaas_payments: {
        Row: { id: string; sale_id: string; asaas_customer_id: string; asaas_payment_id: string; status: string; pix_payload: string | null; pix_encoded_image: string | null; pix_expiration_date: string | null; created_at: string; updated_at: string; paid_at: string | null }
        Insert: { id?: string; sale_id: string; asaas_customer_id: string; asaas_payment_id: string; status?: string; pix_payload?: string | null; pix_encoded_image?: string | null; pix_expiration_date?: string | null; created_at?: string; updated_at?: string; paid_at?: string | null }
        Update: { id?: string; sale_id?: string; asaas_customer_id?: string; asaas_payment_id?: string; status?: string; pix_payload?: string | null; pix_encoded_image?: string | null; pix_expiration_date?: string | null; created_at?: string; updated_at?: string; paid_at?: string | null }
        Relationships: [{ foreignKeyName: "asaas_payments_sale_id_fkey"; columns: ["sale_id"]; isOneToOne: true; referencedRelation: "sales"; referencedColumns: ["id"] }]
      }
      asaas_webhook_events: {
        Row: { id: string; event: string; payload: Json; created_at: string; processed_at: string | null }
        Insert: { id: string; event: string; payload: Json; created_at?: string; processed_at?: string | null }
        Update: { id?: string; event?: string; payload?: Json; created_at?: string; processed_at?: string | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      claim_admin: { Args: never; Returns: boolean }
      current_reseller_id: { Args: never; Returns: string }
      has_role: { Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }; Returns: boolean }
      link_reseller_account: { Args: never; Returns: string }
    }
    Enums: { app_role: "admin" | "reseller" }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals }, TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never) = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never : never

export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals }, TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never) = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never

export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals }, TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never) = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never

export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals }, EnumName extends (DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never) = never> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never

export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals }, CompositeTypeName extends (DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["CompositeTypes"] : never) = never> = never

export const Constants = { public: { Enums: { app_role: ["admin", "reseller"] } } } as const

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
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          id: string
          ip_address: string | null
          method: string
          path: string
          status_code: number | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          method: string
          path: string
          status_code?: number | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip_address?: string | null
          method?: string
          path?: string
          status_code?: number | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          commission_hold_days: number
          default_affiliate_rate: number
          default_manager_rate: number
          default_sam_rate: number
          id: number
          platform_name: string
          support_email: string
          updated_at: string
        }
        Insert: {
          commission_hold_days?: number
          default_affiliate_rate?: number
          default_manager_rate?: number
          default_sam_rate?: number
          id?: number
          platform_name?: string
          support_email?: string
          updated_at?: string
        }
        Update: {
          commission_hold_days?: number
          default_affiliate_rate?: number
          default_manager_rate?: number
          default_sam_rate?: number
          id?: number
          platform_name?: string
          support_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount_cents: number
          beneficiary_id: string
          beneficiary_role: Database["public"]["Enums"]["app_role"]
          cleared_at: string | null
          created_at: string
          hold_until: string | null
          id: string
          paid_at: string | null
          payout_id: string | null
          rate: number
          status: Database["public"]["Enums"]["commission_status"]
          subscription_id: string
        }
        Insert: {
          amount_cents: number
          beneficiary_id: string
          beneficiary_role: Database["public"]["Enums"]["app_role"]
          cleared_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          paid_at?: string | null
          payout_id?: string | null
          rate: number
          status?: Database["public"]["Enums"]["commission_status"]
          subscription_id: string
        }
        Update: {
          amount_cents?: number
          beneficiary_id?: string
          beneficiary_role?: Database["public"]["Enums"]["app_role"]
          cleared_at?: string | null
          created_at?: string
          hold_until?: string | null
          id?: string
          paid_at?: string | null
          payout_id?: string | null
          rate?: number
          status?: Database["public"]["Enums"]["commission_status"]
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          affiliate_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          stripe_customer_id: string | null
        }
        Insert: {
          affiliate_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
        }
        Update: {
          affiliate_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          next_retry_at: string | null
          recipient_email: string
          retry_count: number
          status: string
          subject: string | null
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          next_retry_at?: string | null
          recipient_email: string
          retry_count?: number
          status?: string
          subject?: string | null
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          next_retry_at?: string | null
          recipient_email?: string
          retry_count?: number
          status?: string
          subject?: string | null
          template_name?: string
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          created_at: string
          details: Json
          device_fingerprint: string | null
          flag_type: string
          id: string
          ip_address: string | null
          promo_code_id: string | null
          related_user_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_score: number
          severity: Database["public"]["Enums"]["fraud_severity"]
          status: Database["public"]["Enums"]["fraud_status"]
          subject_user_id: string | null
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          device_fingerprint?: string | null
          flag_type: string
          id?: string
          ip_address?: string | null
          promo_code_id?: string | null
          related_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number
          severity?: Database["public"]["Enums"]["fraud_severity"]
          status?: Database["public"]["Enums"]["fraud_status"]
          subject_user_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          device_fingerprint?: string | null
          flag_type?: string
          id?: string
          ip_address?: string | null
          promo_code_id?: string | null
          related_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number
          severity?: Database["public"]["Enums"]["fraud_severity"]
          status?: Database["public"]["Enums"]["fraud_status"]
          subject_user_id?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_admin_alerts: boolean
          email_commissions: boolean
          email_marketing: boolean
          email_payouts: boolean
          email_security: boolean
          email_subscription: boolean
          inapp_admin_alerts: boolean
          inapp_commissions: boolean
          inapp_payouts: boolean
          inapp_subscription: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_admin_alerts?: boolean
          email_commissions?: boolean
          email_marketing?: boolean
          email_payouts?: boolean
          email_security?: boolean
          email_subscription?: boolean
          inapp_admin_alerts?: boolean
          inapp_commissions?: boolean
          inapp_payouts?: boolean
          inapp_subscription?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_admin_alerts?: boolean
          email_commissions?: boolean
          email_marketing?: boolean
          email_payouts?: boolean
          email_security?: boolean
          email_subscription?: boolean
          inapp_admin_alerts?: boolean
          inapp_commissions?: boolean
          inapp_payouts?: boolean
          inapp_subscription?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount_cents: number
          beneficiary_id: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount_cents: number
          beneficiary_id: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount_cents?: number
          beneficiary_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payouts_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          interval: Database["public"]["Enums"]["plan_interval"]
          is_active: boolean
          name: string
          price_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name: string
          price_cents: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name?: string
          price_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          commission_rate: number | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          metadata: Json
          parent_user_id: string | null
          status: Database["public"]["Enums"]["account_status"]
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          metadata?: Json
          parent_user_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          metadata?: Json
          parent_user_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          affiliate_id: string | null
          code: string
          created_at: string
          discount_percent: number
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["promo_status"]
          stripe_coupon_id: string | null
          stripe_promo_id: string | null
          updated_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          affiliate_id?: string | null
          code: string
          created_at?: string
          discount_percent: number
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promo_status"]
          stripe_coupon_id?: string | null
          stripe_promo_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          affiliate_id?: string | null
          code?: string
          created_at?: string
          discount_percent?: number
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promo_status"]
          stripe_coupon_id?: string | null
          stripe_promo_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_paid_cents: number
          created_at: string
          current_period_end: string | null
          customer_id: string
          id: string
          plan_id: string
          promo_code_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          created_at?: string
          current_period_end?: string | null
          customer_id: string
          id?: string
          plan_id: string
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          created_at?: string
          current_period_end?: string | null
          customer_id?: string
          id?: string
          plan_id?: string
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          raw: Json | null
          stripe_event_id: string | null
          subscription_id: string | null
          type: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          raw?: Json | null
          stripe_event_id?: string | null
          subscription_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          raw?: Json | null
          stripe_event_id?: string | null
          subscription_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event_id: string | null
          event_type: string
          id: string
          payload: Json | null
          processed: boolean
          source: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed?: boolean
          source: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_due_commissions: { Args: never; Returns: number }
      create_notification: {
        Args: {
          _body?: string
          _link?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      flag_fraud: {
        Args: {
          _details: Json
          _flag_type: string
          _related: string
          _risk: number
          _severity: Database["public"]["Enums"]["fraud_severity"]
          _subject: string
        }
        Returns: string
      }
      get_ancestor_chain: {
        Args: { _user_id: string }
        Returns: {
          commission_rate: number
          depth: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ancestor_of: {
        Args: { _ancestor: string; _descendant: string }
        Returns: boolean
      }
      notify_user_with_pref: {
        Args: {
          _body?: string
          _category: string
          _link?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      report_churn: {
        Args: { _days?: number }
        Returns: {
          active_start: number
          churn_rate: number
          churned: number
        }[]
      }
      report_cohort_retention: {
        Args: { _months_back?: number }
        Returns: {
          cohort: string
          customers: number
          period_offset: number
          retained: number
        }[]
      }
      report_ltv: {
        Args: never
        Returns: {
          avg_ltv_cents: number
          total_customers: number
          total_revenue_cents: number
        }[]
      }
      report_revenue_timeseries: {
        Args: { _bucket?: string; _end: string; _start: string }
        Returns: {
          bucket: string
          gross_cents: number
          net_cents: number
          refunds_cents: number
        }[]
      }
      system_health_snapshot: { Args: never; Returns: Json }
    }
    Enums: {
      account_status: "active" | "suspended" | "pending"
      app_role: "super_admin" | "sam" | "manager" | "affiliate" | "customer"
      commission_status:
        | "pending"
        | "hold"
        | "cleared"
        | "paid"
        | "refunded"
        | "failed"
      fraud_severity: "low" | "medium" | "high" | "critical"
      fraud_status: "open" | "reviewing" | "dismissed" | "confirmed"
      payout_status: "pending" | "processing" | "paid" | "failed"
      plan_interval: "month" | "quarter" | "year"
      promo_status: "active" | "inactive" | "expired"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
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
      account_status: ["active", "suspended", "pending"],
      app_role: ["super_admin", "sam", "manager", "affiliate", "customer"],
      commission_status: [
        "pending",
        "hold",
        "cleared",
        "paid",
        "refunded",
        "failed",
      ],
      fraud_severity: ["low", "medium", "high", "critical"],
      fraud_status: ["open", "reviewing", "dismissed", "confirmed"],
      payout_status: ["pending", "processing", "paid", "failed"],
      plan_interval: ["month", "quarter", "year"],
      promo_status: ["active", "inactive", "expired"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
    },
  },
} as const

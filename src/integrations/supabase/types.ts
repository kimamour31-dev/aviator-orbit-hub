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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      balance_adjustments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      game_settings: {
        Row: {
          house_edge: number
          id: number
          max_bet: number
          max_multiplier: number
          max_payout: number
          min_bet: number
          real_mode_enabled: boolean
          updated_at: string
        }
        Insert: {
          house_edge?: number
          id?: number
          max_bet?: number
          max_multiplier?: number
          max_payout?: number
          min_bet?: number
          real_mode_enabled?: boolean
          updated_at?: string
        }
        Update: {
          house_edge?: number
          id?: number
          max_bet?: number
          max_multiplier?: number
          max_payout?: number
          min_bet?: number
          real_mode_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      odds_rules: {
        Row: {
          created_at: string
          enabled: boolean
          end_hour: number
          id: string
          label: string
          max_multiplier: number
          start_hour: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          end_hour: number
          id?: string
          label?: string
          max_multiplier: number
          start_hour: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          end_hour?: number
          id?: string
          label?: string
          max_multiplier?: number
          start_hour?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number
          created_at: string
          display_name: string | null
          id: string
          phone: string
        }
        Insert: {
          balance?: number
          created_at?: string
          display_name?: string | null
          id: string
          phone: string
        }
        Update: {
          balance?: number
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string
        }
        Relationships: []
      }
      real_bets: {
        Row: {
          auto_cashout: number | null
          cashed_at: number | null
          created_at: string
          id: string
          payout: number
          round_id: string
          slot: number
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          auto_cashout?: number | null
          cashed_at?: number | null
          created_at?: string
          id?: string
          payout?: number
          round_id: string
          slot: number
          stake: number
          status?: string
          user_id: string
        }
        Update: {
          auto_cashout?: number | null
          cashed_at?: number | null
          created_at?: string
          id?: string
          payout?: number
          round_id?: string
          slot?: number
          stake?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "real_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      real_rounds: {
        Row: {
          crash_point: number
          ended: boolean
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          crash_point: number
          ended?: boolean
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          crash_point?: number
          ended?: boolean
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_risk: {
        Row: {
          blocked: boolean
          house_edge: number | null
          max_bet: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked?: boolean
          house_edge?: number | null
          max_bet?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked?: boolean
          house_edge?: number | null
          max_bet?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _mult_since: { Args: { _t: string }; Returns: number }
      _settle_round: { Args: { _rid: string }; Returns: undefined }
      admin_adjust_balance: {
        Args: { _amount: number; _note: string; _user_id: string }
        Returns: number
      }
      admin_stats: { Args: { _days: number }; Returns: Json }
      cash_out_real: {
        Args: { _round_id: string; _slot: number }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      real_round_status: { Args: { _round_id: string }; Returns: Json }
      start_real_round: {
        Args: {
          _auto1: number
          _auto2: number
          _stake1: number
          _stake2: number
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const

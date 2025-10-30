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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      framework_executions: {
        Row: {
          ai_model: string | null
          analysis_id: string | null
          completed_at: string | null
          error_message: string | null
          execution_time: number | null
          exported_to_pdf: boolean | null
          framework_id: string | null
          id: string
          input_data: Json | null
          manually_edited: boolean | null
          prompt_used: string | null
          raw_response: Json | null
          rendered_html: string | null
          started_at: string | null
          status: string | null
          tokens_used: number | null
          user_id: string | null
          validation_errors: Json | null
          validation_passed: boolean | null
        }
        Insert: {
          ai_model?: string | null
          analysis_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          execution_time?: number | null
          exported_to_pdf?: boolean | null
          framework_id?: string | null
          id?: string
          input_data?: Json | null
          manually_edited?: boolean | null
          prompt_used?: string | null
          raw_response?: Json | null
          rendered_html?: string | null
          started_at?: string | null
          status?: string | null
          tokens_used?: number | null
          user_id?: string | null
          validation_errors?: Json | null
          validation_passed?: boolean | null
        }
        Update: {
          ai_model?: string | null
          analysis_id?: string | null
          completed_at?: string | null
          error_message?: string | null
          execution_time?: number | null
          exported_to_pdf?: boolean | null
          framework_id?: string | null
          id?: string
          input_data?: Json | null
          manually_edited?: boolean | null
          prompt_used?: string | null
          raw_response?: Json | null
          rendered_html?: string | null
          started_at?: string | null
          status?: string | null
          tokens_used?: number | null
          user_id?: string | null
          validation_errors?: Json | null
          validation_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "framework_executions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "saved_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "framework_executions_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      frameworks: {
        Row: {
          ai_model: string | null
          allow_manual_edit: boolean | null
          allow_pdf_export: boolean | null
          analysis_prompt: string
          category: string | null
          created_at: string | null
          created_by: string | null
          custom_css: string | null
          departments: string[] | null
          description: string | null
          downstream_frameworks: string[] | null
          estimated_time: number | null
          goal_alignment: string[] | null
          icon: string | null
          id: string
          layout_style: string | null
          max_tokens: number | null
          output_template: string
          parent_version: string | null
          required_upstream: string[] | null
          requires_business_context: boolean | null
          response_schema: Json | null
          shortcut: string
          show_in_playbooks: boolean | null
          stages: string[] | null
          status: Database["public"]["Enums"]["framework_status"] | null
          system_prompt: string | null
          tags: string[] | null
          temperature: number | null
          template_type: string | null
          title: string
          updated_at: string | null
          upstream_frameworks: string[] | null
          usage_count: number | null
          validate_json: boolean | null
          version: number | null
          when_to_use: string | null
        }
        Insert: {
          ai_model?: string | null
          allow_manual_edit?: boolean | null
          allow_pdf_export?: boolean | null
          analysis_prompt: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_css?: string | null
          departments?: string[] | null
          description?: string | null
          downstream_frameworks?: string[] | null
          estimated_time?: number | null
          goal_alignment?: string[] | null
          icon?: string | null
          id?: string
          layout_style?: string | null
          max_tokens?: number | null
          output_template: string
          parent_version?: string | null
          required_upstream?: string[] | null
          requires_business_context?: boolean | null
          response_schema?: Json | null
          shortcut: string
          show_in_playbooks?: boolean | null
          stages?: string[] | null
          status?: Database["public"]["Enums"]["framework_status"] | null
          system_prompt?: string | null
          tags?: string[] | null
          temperature?: number | null
          template_type?: string | null
          title: string
          updated_at?: string | null
          upstream_frameworks?: string[] | null
          usage_count?: number | null
          validate_json?: boolean | null
          version?: number | null
          when_to_use?: string | null
        }
        Update: {
          ai_model?: string | null
          allow_manual_edit?: boolean | null
          allow_pdf_export?: boolean | null
          analysis_prompt?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_css?: string | null
          departments?: string[] | null
          description?: string | null
          downstream_frameworks?: string[] | null
          estimated_time?: number | null
          goal_alignment?: string[] | null
          icon?: string | null
          id?: string
          layout_style?: string | null
          max_tokens?: number | null
          output_template?: string
          parent_version?: string | null
          required_upstream?: string[] | null
          requires_business_context?: boolean | null
          response_schema?: Json | null
          shortcut?: string
          show_in_playbooks?: boolean | null
          stages?: string[] | null
          status?: Database["public"]["Enums"]["framework_status"] | null
          system_prompt?: string | null
          tags?: string[] | null
          temperature?: number | null
          template_type?: string | null
          title?: string
          updated_at?: string | null
          upstream_frameworks?: string[] | null
          usage_count?: number | null
          validate_json?: boolean | null
          version?: number | null
          when_to_use?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frameworks_parent_version_fkey"
            columns: ["parent_version"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          business_context: Json
          company_id: string
          company_name: string
          created_at: string | null
          framework_id: string | null
          id: string
          is_edited: boolean | null
          original_content: string | null
          report_content: string
          report_format: string | null
          status: string | null
          strategic_goal: string | null
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          business_context: Json
          company_id: string
          company_name: string
          created_at?: string | null
          framework_id?: string | null
          id?: string
          is_edited?: boolean | null
          original_content?: string | null
          report_content: string
          report_format?: string | null
          status?: string | null
          strategic_goal?: string | null
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          business_context?: Json
          company_id?: string
          company_name?: string
          created_at?: string | null
          framework_id?: string | null
          id?: string
          is_edited?: boolean | null
          original_content?: string | null
          report_content?: string
          report_format?: string | null
          status?: string | null
          strategic_goal?: string | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_generated_reports_analysis"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "saved_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "saved_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_reports_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      saved_analyses: {
        Row: {
          analysis_data: Json
          company_name: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          analysis_data: Json
          company_name: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          analysis_data?: Json
          company_name?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      strategic_frameworks: {
        Row: {
          category: string
          company_stages: string[] | null
          created_at: string | null
          departments: string[] | null
          description: string
          estimated_time: number | null
          goal_alignment: string[] | null
          id: string
          shortcut: string | null
          status: string | null
          title: string
          when_to_use: string[] | null
        }
        Insert: {
          category: string
          company_stages?: string[] | null
          created_at?: string | null
          departments?: string[] | null
          description: string
          estimated_time?: number | null
          goal_alignment?: string[] | null
          id: string
          shortcut?: string | null
          status?: string | null
          title: string
          when_to_use?: string[] | null
        }
        Update: {
          category?: string
          company_stages?: string[] | null
          created_at?: string | null
          departments?: string[] | null
          description?: string
          estimated_time?: number | null
          goal_alignment?: string[] | null
          id?: string
          shortcut?: string | null
          status?: string | null
          title?: string
          when_to_use?: string[] | null
        }
        Relationships: []
      }
      strategy_coaching_sessions: {
        Row: {
          company_id: string | null
          company_name: string | null
          created_at: string | null
          id: string
          initial_prompt: string | null
          messages: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          initial_prompt?: string | null
          messages?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          initial_prompt?: string | null
          messages?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_coaching_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "saved_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_sessions: {
        Row: {
          company_id: string | null
          company_name: string
          created_at: string | null
          goal_input: string
          id: string
          insights: Json | null
          recommended_frameworks: Json | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          company_name: string
          created_at?: string | null
          goal_input: string
          id?: string
          insights?: Json | null
          recommended_frameworks?: Json | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          company_name?: string
          created_at?: string | null
          goal_input?: string
          id?: string
          insights?: Json | null
          recommended_frameworks?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "saved_analyses"
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      framework_status: "draft" | "active" | "archived"
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
      app_role: ["admin", "user"],
      framework_status: ["draft", "active", "archived"],
    },
  },
} as const

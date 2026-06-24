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
      accounts: {
        Row: {
          id: string
          name: string
          slug: string | null
          runtime_config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug?: string | null
          runtime_config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string | null
          runtime_config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_members: {
        Row: {
          id: string
          account_id: string
          user_id: string
          role: Database["public"]["Enums"]["account_member_role"]
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          user_id: string
          role?: Database["public"]["Enums"]["account_member_role"]
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["account_member_role"]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      business_context_versions: {
        Row: {
          id: string
          account_id: string
          source_analysis_id: string | null
          version_number: number
          summary: string | null
          company_name: string | null
          website: string | null
          industry: string | null
          data: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          source_analysis_id?: string | null
          version_number?: number
          summary?: string | null
          company_name?: string | null
          website?: string | null
          industry?: string | null
          data?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          source_analysis_id?: string | null
          version_number?: number
          summary?: string | null
          company_name?: string | null
          website?: string | null
          industry?: string | null
          data?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_context_versions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_section_versions: {
        Row: {
          id: string
          account_id: string
          business_context_version_id: string
          section_key: string
          section_title: string | null
          items: Json
          notes: string | null
          confidence: number | null
          freshness_status: Database["public"]["Enums"]["freshness_status"]
          last_verified_at: string | null
          created_by_agent_profile_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          business_context_version_id: string
          section_key: string
          section_title?: string | null
          items?: Json
          notes?: string | null
          confidence?: number | null
          freshness_status?: Database["public"]["Enums"]["freshness_status"]
          last_verified_at?: string | null
          created_by_agent_profile_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          business_context_version_id?: string
          section_key?: string
          section_title?: string | null
          items?: Json
          notes?: string | null
          confidence?: number | null
          freshness_status?: Database["public"]["Enums"]["freshness_status"]
          last_verified_at?: string | null
          created_by_agent_profile_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_section_versions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_section_versions_business_context_version_id_fkey"
            columns: ["business_context_version_id"]
            isOneToOne: false
            referencedRelation: "business_context_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          id: string
          account_id: string
          source_type: Database["public"]["Enums"]["evidence_source_type"]
          source_name: string | null
          source_url: string | null
          source_date: string | null
          retrieved_at: string
          title: string
          excerpt: string | null
          metadata: Json
          created_by_agent_run_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          source_type?: Database["public"]["Enums"]["evidence_source_type"]
          source_name?: string | null
          source_url?: string | null
          source_date?: string | null
          retrieved_at?: string
          title: string
          excerpt?: string | null
          metadata?: Json
          created_by_agent_run_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          source_type?: Database["public"]["Enums"]["evidence_source_type"]
          source_name?: string | null
          source_url?: string | null
          source_date?: string | null
          retrieved_at?: string
          title?: string
          excerpt?: string | null
          metadata?: Json
          created_by_agent_run_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      gaps: {
        Row: {
          id: string
          account_id: string
          title: string
          description: string | null
          gap_type: Database["public"]["Enums"]["gap_type"]
          severity: Database["public"]["Enums"]["gap_severity"]
          impact: string | null
          effort: string | null
          confidence: number | null
          status: Database["public"]["Enums"]["gap_status"]
          affected_sections: string[]
          evidence_ids: string[]
          recommended_action: string | null
          created_by_agent_run_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          title: string
          description?: string | null
          gap_type?: Database["public"]["Enums"]["gap_type"]
          severity?: Database["public"]["Enums"]["gap_severity"]
          impact?: string | null
          effort?: string | null
          confidence?: number | null
          status?: Database["public"]["Enums"]["gap_status"]
          affected_sections?: string[]
          evidence_ids?: string[]
          recommended_action?: string | null
          created_by_agent_run_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          title?: string
          description?: string | null
          gap_type?: Database["public"]["Enums"]["gap_type"]
          severity?: Database["public"]["Enums"]["gap_severity"]
          impact?: string | null
          effort?: string | null
          confidence?: number | null
          status?: Database["public"]["Enums"]["gap_status"]
          affected_sections?: string[]
          evidence_ids?: string[]
          recommended_action?: string | null
          created_by_agent_run_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_profiles: {
        Row: {
          id: string
          account_id: string | null
          agent_key: string
          display_name: string
          agent_type: Database["public"]["Enums"]["agent_type"]
          description: string | null
          assigned_sections: string[]
          model_route_key: string | null
          allowed_mcp_server_ids: string[]
          status: Database["public"]["Enums"]["agent_status"]
          system_instructions_summary: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id?: string | null
          agent_key: string
          display_name: string
          agent_type?: Database["public"]["Enums"]["agent_type"]
          description?: string | null
          assigned_sections?: string[]
          model_route_key?: string | null
          allowed_mcp_server_ids?: string[]
          status?: Database["public"]["Enums"]["agent_status"]
          system_instructions_summary?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string | null
          agent_key?: string
          display_name?: string
          agent_type?: Database["public"]["Enums"]["agent_type"]
          description?: string | null
          assigned_sections?: string[]
          model_route_key?: string | null
          allowed_mcp_server_ids?: string[]
          status?: Database["public"]["Enums"]["agent_status"]
          system_instructions_summary?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          id: string
          account_id: string
          agent_profile_id: string
          run_type: string | null
          trigger_type: Database["public"]["Enums"]["agent_run_trigger"]
          triggered_by: string | null
          status: Database["public"]["Enums"]["agent_run_status"]
          input: Json | null
          output: Json | null
          summary: string | null
          model_provider: string | null
          model_name: string | null
          tokens_in: number | null
          tokens_out: number | null
          estimated_cost: number | null
          started_at: string | null
          completed_at: string | null
          error: string | null
        }
        Insert: {
          id?: string
          account_id: string
          agent_profile_id: string
          run_type?: string | null
          trigger_type?: Database["public"]["Enums"]["agent_run_trigger"]
          triggered_by?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          input?: Json | null
          output?: Json | null
          summary?: string | null
          model_provider?: string | null
          model_name?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          estimated_cost?: number | null
          started_at?: string | null
          completed_at?: string | null
          error?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          agent_profile_id?: string
          run_type?: string | null
          trigger_type?: Database["public"]["Enums"]["agent_run_trigger"]
          triggered_by?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          input?: Json | null
          output?: Json | null
          summary?: string | null
          model_provider?: string | null
          model_name?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          estimated_cost?: number | null
          started_at?: string | null
          completed_at?: string | null
          error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_agent_profile_id_fkey"
            columns: ["agent_profile_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_loops: {
        Row: {
          id: string
          account_id: string
          agent_profile_id: string
          loop_name: string
          schedule: string
          skill_ids: string[]
          prompt_template: string | null
          max_runtime_minutes: number
          max_consecutive_failures: number
          monthly_budget: number | null
          allowed_mcp_server_ids: string[]
          status: Database["public"]["Enums"]["loop_status"]
          last_run_at: string | null
          next_run_at: string | null
          failure_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          agent_profile_id: string
          loop_name: string
          schedule: string
          skill_ids?: string[]
          prompt_template?: string | null
          max_runtime_minutes?: number
          max_consecutive_failures?: number
          monthly_budget?: number | null
          allowed_mcp_server_ids?: string[]
          status?: Database["public"]["Enums"]["loop_status"]
          last_run_at?: string | null
          next_run_at?: string | null
          failure_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          agent_profile_id?: string
          loop_name?: string
          schedule?: string
          skill_ids?: string[]
          prompt_template?: string | null
          max_runtime_minutes?: number
          max_consecutive_failures?: number
          monthly_budget?: number | null
          allowed_mcp_server_ids?: string[]
          status?: Database["public"]["Enums"]["loop_status"]
          last_run_at?: string | null
          next_run_at?: string | null
          failure_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_loops_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_loops_agent_profile_id_fkey"
            columns: ["agent_profile_id"]
            isOneToOne: false
            referencedRelation: "agent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials: {
        Row: {
          id: string
          account_id: string
          provider: string
          label: string | null
          encrypted_secret: string
          secret_last_four: string | null
          status: Database["public"]["Enums"]["credential_status"]
          validated_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          provider: string
          label?: string | null
          encrypted_secret: string
          secret_last_four?: string | null
          status?: Database["public"]["Enums"]["credential_status"]
          validated_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          provider?: string
          label?: string | null
          encrypted_secret?: string
          secret_last_four?: string | null
          status?: Database["public"]["Enums"]["credential_status"]
          validated_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          id: string
          account_id: string
          name: string
          transport_type: Database["public"]["Enums"]["mcp_transport_type"]
          command: string | null
          args: Json
          url: string | null
          headers_encrypted: Json | null
          env_encrypted: Json | null
          auth_type: string | null
          enabled: boolean
          status: Database["public"]["Enums"]["mcp_server_status"]
          last_tested_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          name: string
          transport_type?: Database["public"]["Enums"]["mcp_transport_type"]
          command?: string | null
          args?: Json
          url?: string | null
          headers_encrypted?: Json | null
          env_encrypted?: Json | null
          auth_type?: string | null
          enabled?: boolean
          status?: Database["public"]["Enums"]["mcp_server_status"]
          last_tested_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          name?: string
          transport_type?: Database["public"]["Enums"]["mcp_transport_type"]
          command?: string | null
          args?: Json
          url?: string | null
          headers_encrypted?: Json | null
          env_encrypted?: Json | null
          auth_type?: string | null
          enabled?: boolean
          status?: Database["public"]["Enums"]["mcp_server_status"]
          last_tested_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_server_tools: {
        Row: {
          id: string
          mcp_server_id: string
          tool_name: string
          description: string | null
          enabled: boolean
          risk_level: string
          last_discovered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          mcp_server_id: string
          tool_name: string
          description?: string | null
          enabled?: boolean
          risk_level?: string
          last_discovered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          mcp_server_id?: string
          tool_name?: string
          description?: string | null
          enabled?: boolean
          risk_level?: string
          last_discovered_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_server_tools_mcp_server_id_fkey"
            columns: ["mcp_server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
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
      account_member_role: "owner" | "admin" | "editor" | "viewer"
      agent_type: "orchestrator" | "section_agent" | "utility" | "custom"
      agent_status: "active" | "paused" | "draft" | "archived"
      agent_run_status: "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout"
      agent_run_trigger: "manual" | "scheduled" | "api" | "cascade" | "retry"
      gap_severity: "critical" | "high" | "medium" | "low"
      gap_status: "open" | "acknowledged" | "in_progress" | "resolved" | "wont_fix"
      gap_type: "missing_data" | "low_confidence" | "no_evidence" | "outdated" | "contradictory" | "assumption"
      credential_status: "active" | "revoked" | "expired" | "untested"
      mcp_transport_type: "stdio" | "http" | "sse" | "websocket"
      mcp_server_status: "connected" | "disconnected" | "error" | "untested"
      loop_status: "active" | "paused" | "error" | "exhausted_budget" | "exhausted_failures"
      freshness_status: "fresh" | "stale" | "outdated" | "unverified"
      evidence_source_type: "website" | "filing" | "news" | "transcript" | "social" | "api" | "document" | "manual"
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
      account_member_role: ["owner", "admin", "editor", "viewer"],
      agent_type: ["orchestrator", "section_agent", "utility", "custom"],
      agent_status: ["active", "paused", "draft", "archived"],
      agent_run_status: ["pending", "running", "completed", "failed", "cancelled", "timeout"],
      agent_run_trigger: ["manual", "scheduled", "api", "cascade", "retry"],
      gap_severity: ["critical", "high", "medium", "low"],
      gap_status: ["open", "acknowledged", "in_progress", "resolved", "wont_fix"],
      gap_type: ["missing_data", "low_confidence", "no_evidence", "outdated", "contradictory", "assumption"],
      credential_status: ["active", "revoked", "expired", "untested"],
      mcp_transport_type: ["stdio", "http", "sse", "websocket"],
      mcp_server_status: ["connected", "disconnected", "error", "untested"],
      loop_status: ["active", "paused", "error", "exhausted_budget", "exhausted_failures"],
      freshness_status: ["fresh", "stale", "outdated", "unverified"],
      evidence_source_type: ["website", "filing", "news", "transcript", "social", "api", "document", "manual"],
    },
  },
} as const

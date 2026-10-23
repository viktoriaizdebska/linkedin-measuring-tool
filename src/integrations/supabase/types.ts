export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      account_metrics: {
        Row: {
          created_at: string;
          id: string;
          metric_key: string;
          snapshot_id: string;
          value: number;
          window_end: string | null;
          window_start: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metric_key: string;
          snapshot_id: string;
          value: number;
          window_end?: string | null;
          window_start?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          metric_key?: string;
          snapshot_id?: string;
          value?: number;
          window_end?: string | null;
          window_start?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_metrics_metric_key_fkey";
            columns: ["metric_key"];
            isOneToOne: false;
            referencedRelation: "metric_catalog";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_metrics_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      agent_runs: {
        Row: {
          attempt: number;
          changes_summary: string | null;
          created_at: string;
          due_kind: string | null;
          duration_ms: number | null;
          error_count: number | null;
          finished_at: string | null;
          id: string;
          input_key: string;
          period_id: string | null;
          records_read: number | null;
          records_written: number | null;
          retryable: boolean | null;
          started_at: string | null;
          status: string;
          trigger: string;
          workflow_version: string | null;
        };
        Insert: {
          attempt?: number;
          changes_summary?: string | null;
          created_at?: string;
          due_kind?: string | null;
          duration_ms?: number | null;
          error_count?: number | null;
          finished_at?: string | null;
          id?: string;
          input_key: string;
          period_id?: string | null;
          records_read?: number | null;
          records_written?: number | null;
          retryable?: boolean | null;
          started_at?: string | null;
          status: string;
          trigger: string;
          workflow_version?: string | null;
        };
        Update: {
          attempt?: number;
          changes_summary?: string | null;
          created_at?: string;
          due_kind?: string | null;
          duration_ms?: number | null;
          error_count?: number | null;
          finished_at?: string | null;
          id?: string;
          input_key?: string;
          period_id?: string | null;
          records_read?: number | null;
          records_written?: number | null;
          retryable?: boolean | null;
          started_at?: string | null;
          status?: string;
          trigger?: string;
          workflow_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "agent_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
        ];
      };
      allowed_users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
      annotations: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          kind: string;
          label: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          kind: string;
          label: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          kind?: string;
          label?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          created_at: string;
          email_reminders: boolean;
          email_summaries: boolean;
          id: string;
          singleton: boolean;
        };
        Insert: {
          created_at?: string;
          email_reminders?: boolean;
          email_summaries?: boolean;
          id?: string;
          singleton?: boolean;
        };
        Update: {
          created_at?: string;
          email_reminders?: boolean;
          email_summaries?: boolean;
          id?: string;
          singleton?: boolean;
        };
        Relationships: [];
      };
      audience_checks: {
        Row: {
          broad_count: number;
          checked_on: string;
          created_at: string;
          id: string;
          method_version: string;
          none_count: number;
          sample_size: number;
          snapshot_id: string;
          strict_count: number;
        };
        Insert: {
          broad_count: number;
          checked_on: string;
          created_at?: string;
          id?: string;
          method_version: string;
          none_count: number;
          sample_size: number;
          snapshot_id: string;
          strict_count: number;
        };
        Update: {
          broad_count?: number;
          checked_on?: string;
          created_at?: string;
          id?: string;
          method_version?: string;
          none_count?: number;
          sample_size?: number;
          snapshot_id?: string;
          strict_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_checks_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      audience_observations: {
        Row: {
          below_one_pct: boolean | null;
          created_at: string;
          dimension: string;
          id: string;
          label: string;
          label_raw: string | null;
          scope: string;
          share_pct: number | null;
          snapshot_id: string;
        };
        Insert: {
          below_one_pct?: boolean | null;
          created_at?: string;
          dimension: string;
          id?: string;
          label: string;
          label_raw?: string | null;
          scope: string;
          share_pct?: number | null;
          snapshot_id: string;
        };
        Update: {
          below_one_pct?: boolean | null;
          created_at?: string;
          dimension?: string;
          id?: string;
          label?: string;
          label_raw?: string | null;
          scope?: string;
          share_pct?: number | null;
          snapshot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audience_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      benchmark_observations: {
        Row: {
          authority_beyond: number | null;
          banner_featured: number | null;
          cadence: number | null;
          cadence_text: string | null;
          conversation_audience: number | null;
          conversion_device: number | null;
          created_at: string;
          followers: number | null;
          framework_total: number | null;
          headline_stake: number | null;
          id: string;
          median_comments: number | null;
          median_reactions: number | null;
          method: string | null;
          observed_on: string;
          one_story: number | null;
          owned_concept: number | null;
          posts_per_week: number | null;
          profile_key: string;
          raw_import_id: string | null;
          reactions_per_follower_pct: number | null;
          substance_format: number | null;
          topic_focus: number | null;
        };
        Insert: {
          authority_beyond?: number | null;
          banner_featured?: number | null;
          cadence?: number | null;
          cadence_text?: string | null;
          conversation_audience?: number | null;
          conversion_device?: number | null;
          created_at?: string;
          followers?: number | null;
          framework_total?: number | null;
          headline_stake?: number | null;
          id?: string;
          median_comments?: number | null;
          median_reactions?: number | null;
          method?: string | null;
          observed_on: string;
          one_story?: number | null;
          owned_concept?: number | null;
          posts_per_week?: number | null;
          profile_key: string;
          raw_import_id?: string | null;
          reactions_per_follower_pct?: number | null;
          substance_format?: number | null;
          topic_focus?: number | null;
        };
        Update: {
          authority_beyond?: number | null;
          banner_featured?: number | null;
          cadence?: number | null;
          cadence_text?: string | null;
          conversation_audience?: number | null;
          conversion_device?: number | null;
          created_at?: string;
          followers?: number | null;
          framework_total?: number | null;
          headline_stake?: number | null;
          id?: string;
          median_comments?: number | null;
          median_reactions?: number | null;
          method?: string | null;
          observed_on?: string;
          one_story?: number | null;
          owned_concept?: number | null;
          posts_per_week?: number | null;
          profile_key?: string;
          raw_import_id?: string | null;
          reactions_per_follower_pct?: number | null;
          substance_format?: number | null;
          topic_focus?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "benchmark_observations_profile_key_fkey";
            columns: ["profile_key"];
            isOneToOne: false;
            referencedRelation: "benchmark_profiles";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "benchmark_observations_raw_import_id_fkey";
            columns: ["raw_import_id"];
            isOneToOne: false;
            referencedRelation: "raw_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      benchmark_profiles: {
        Row: {
          active: boolean;
          created_at: string;
          how_visitors_become_followers: string | null;
          is_self: boolean;
          key: string;
          linkedin_url: string | null;
          name: string;
          named_concepts: string | null;
          person_for: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          how_visitors_become_followers?: string | null;
          is_self?: boolean;
          key: string;
          linkedin_url?: string | null;
          name: string;
          named_concepts?: string | null;
          person_for?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          how_visitors_become_followers?: string | null;
          is_self?: boolean;
          key?: string;
          linkedin_url?: string | null;
          name?: string;
          named_concepts?: string | null;
          person_for?: string | null;
        };
        Relationships: [];
      };
      content_items: {
        Row: {
          created_at: string;
          cta_rank: number | null;
          id: string;
          pillar_key: string | null;
          planned_for: string | null;
          published_post_urn: string | null;
          status: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          cta_rank?: number | null;
          id?: string;
          pillar_key?: string | null;
          planned_for?: string | null;
          published_post_urn?: string | null;
          status?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          cta_rank?: number | null;
          id?: string;
          pillar_key?: string | null;
          planned_for?: string | null;
          published_post_urn?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_items_post_fk";
            columns: ["published_post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "content_items_post_fk";
            columns: ["published_post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "content_items_post_fk";
            columns: ["published_post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
        ];
      };
      content_pillars: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          name: string;
          sort_order: number;
          target_share: number | null;
          version_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          name: string;
          sort_order: number;
          target_share?: number | null;
          version_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          name?: string;
          sort_order?: number;
          target_share?: number | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_pillars_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "strategy_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      ctas: {
        Row: {
          created_at: string;
          destination: string | null;
          id: string;
          label: string;
          measured_how: string;
          rank: number;
          version_id: string;
        };
        Insert: {
          created_at?: string;
          destination?: string | null;
          id?: string;
          label: string;
          measured_how: string;
          rank: number;
          version_id: string;
        };
        Update: {
          created_at?: string;
          destination?: string | null;
          id?: string;
          label?: string;
          measured_how?: string;
          rank?: number;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ctas_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "strategy_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      data_quality_issues: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          resolved_at: string | null;
          rule: string;
          run_id: string;
          severity: string;
          subject: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          resolved_at?: string | null;
          rule: string;
          run_id: string;
          severity: string;
          subject?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          resolved_at?: string | null;
          rule?: string;
          run_id?: string;
          severity?: string;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      follower_daily: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          new_followers: number;
          snapshot_id: string;
          total: number | null;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          new_followers: number;
          snapshot_id: string;
          total?: number | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          new_followers?: number;
          snapshot_id?: string;
          total?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follower_daily_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      framework_criteria: {
        Row: {
          created_at: string;
          criteria: string | null;
          description: string | null;
          key: string;
          label: string;
          max_score: number;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          criteria?: string | null;
          description?: string | null;
          key: string;
          label: string;
          max_score?: number;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          criteria?: string | null;
          description?: string | null;
          key?: string;
          label?: string;
          max_score?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      integration_status: {
        Row: {
          api_version: string | null;
          created_at: string;
          last_success_at: string | null;
          provider: string;
          status: string | null;
          token_expires_at: string | null;
          version_sunset_date: string | null;
        };
        Insert: {
          api_version?: string | null;
          created_at?: string;
          last_success_at?: string | null;
          provider: string;
          status?: string | null;
          token_expires_at?: string | null;
          version_sunset_date?: string | null;
        };
        Update: {
          api_version?: string | null;
          created_at?: string;
          last_success_at?: string | null;
          provider?: string;
          status?: string | null;
          token_expires_at?: string | null;
          version_sunset_date?: string | null;
        };
        Relationships: [];
      };
      kpi_definitions: {
        Row: {
          better_when: string;
          created_at: string;
          description: string | null;
          formula: string | null;
          formula_version: number;
          goal_category: string;
          is_north_star: boolean;
          key: string;
          kind: string;
          name: string;
          sort_order: number;
          sources_needed: string[];
          unit: string | null;
        };
        Insert: {
          better_when: string;
          created_at?: string;
          description?: string | null;
          formula?: string | null;
          formula_version?: number;
          goal_category: string;
          is_north_star?: boolean;
          key: string;
          kind: string;
          name: string;
          sort_order: number;
          sources_needed: string[];
          unit?: string | null;
        };
        Update: {
          better_when?: string;
          created_at?: string;
          description?: string | null;
          formula?: string | null;
          formula_version?: number;
          goal_category?: string;
          is_north_star?: boolean;
          key?: string;
          kind?: string;
          name?: string;
          sort_order?: number;
          sources_needed?: string[];
          unit?: string | null;
        };
        Relationships: [];
      };
      kpi_targets: {
        Row: {
          baseline_label: string | null;
          baseline_value: number | null;
          created_at: string;
          id: string;
          kpi_key: string;
          target_by: string | null;
          target_value: number | null;
          version_id: string;
        };
        Insert: {
          baseline_label?: string | null;
          baseline_value?: number | null;
          created_at?: string;
          id?: string;
          kpi_key: string;
          target_by?: string | null;
          target_value?: number | null;
          version_id: string;
        };
        Update: {
          baseline_label?: string | null;
          baseline_value?: number | null;
          created_at?: string;
          id?: string;
          kpi_key?: string;
          target_by?: string | null;
          target_value?: number | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kpi_targets_kpi_key_fkey";
            columns: ["kpi_key"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "kpi_targets_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "strategy_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      kpi_values: {
        Row: {
          created_at: string;
          formula_version: number;
          id: string;
          kind: string;
          kpi_key: string;
          period_id: string;
          run_id: string;
          value: number;
          vs_12_weeks: number | null;
          vs_28_days: number | null;
          vs_baseline: number | null;
          vs_previous: number | null;
        };
        Insert: {
          created_at?: string;
          formula_version: number;
          id?: string;
          kind: string;
          kpi_key: string;
          period_id: string;
          run_id: string;
          value: number;
          vs_12_weeks?: number | null;
          vs_28_days?: number | null;
          vs_baseline?: number | null;
          vs_previous?: number | null;
        };
        Update: {
          created_at?: string;
          formula_version?: number;
          id?: string;
          kind?: string;
          kpi_key?: string;
          period_id?: string;
          run_id?: string;
          value?: number;
          vs_12_weeks?: number | null;
          vs_28_days?: number | null;
          vs_baseline?: number | null;
          vs_previous?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "kpi_values_kpi_key_fkey";
            columns: ["kpi_key"];
            isOneToOne: false;
            referencedRelation: "kpi_definitions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "kpi_values_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "kpi_values_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          attribution: string;
          calendar_event_id: string | null;
          created_at: string;
          date: string;
          id: string;
          kind: string;
          note: string | null;
          person_type: string;
          post_urn: string | null;
          snapshot_id: string;
        };
        Insert: {
          attribution: string;
          calendar_event_id?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          kind: string;
          note?: string | null;
          person_type: string;
          post_urn?: string | null;
          snapshot_id: string;
        };
        Update: {
          attribution?: string;
          calendar_event_id?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          person_type?: string;
          post_urn?: string | null;
          snapshot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      meeting_candidates: {
        Row: {
          attribution: string | null;
          confirmed_type: string | null;
          created_at: string;
          decided_at: string | null;
          domains: string[];
          end_at: string;
          event_id: string;
          guest_count: number;
          id: string;
          lead_id: string | null;
          post_urn: string | null;
          start_at: string;
          status: string;
          suggested_reason: string | null;
          suggested_type: string | null;
          title: string | null;
        };
        Insert: {
          attribution?: string | null;
          confirmed_type?: string | null;
          created_at?: string;
          decided_at?: string | null;
          domains?: string[];
          end_at: string;
          event_id: string;
          guest_count?: number;
          id?: string;
          lead_id?: string | null;
          post_urn?: string | null;
          start_at: string;
          status?: string;
          suggested_reason?: string | null;
          suggested_type?: string | null;
          title?: string | null;
        };
        Update: {
          attribution?: string | null;
          confirmed_type?: string | null;
          created_at?: string;
          decided_at?: string | null;
          domains?: string[];
          end_at?: string;
          event_id?: string;
          guest_count?: number;
          id?: string;
          lead_id?: string | null;
          post_urn?: string | null;
          start_at?: string;
          status?: string;
          suggested_reason?: string | null;
          suggested_type?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meeting_candidates_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "meeting_candidates_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "meeting_candidates_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
        ];
      };
      metric_catalog: {
        Row: {
          aggregation_rule: string;
          created_at: string;
          key: string;
          kind: string;
          label: string;
          metric_type: string;
          unit: string;
        };
        Insert: {
          aggregation_rule: string;
          created_at?: string;
          key: string;
          kind: string;
          label: string;
          metric_type: string;
          unit: string;
        };
        Update: {
          aggregation_rule?: string;
          created_at?: string;
          key?: string;
          kind?: string;
          label?: string;
          metric_type?: string;
          unit?: string;
        };
        Relationships: [];
      };
      notification_log: {
        Row: {
          created_at: string;
          dedupe_key: string;
          id: string;
          kind: string;
          outcome: string;
          period_id: string | null;
          recipient: string;
          run_id: string | null;
          subject: string;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          id?: string;
          kind: string;
          outcome: string;
          period_id?: string | null;
          recipient: string;
          run_id?: string | null;
          subject: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          id?: string;
          kind?: string;
          outcome?: string;
          period_id?: string | null;
          recipient?: string;
          run_id?: string | null;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "notification_log_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "notification_log_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      period_summaries: {
        Row: {
          created_at: string;
          id: string;
          model: string | null;
          period_id: string;
          prompt_version: string | null;
          run_id: string;
          summary: Json;
          tokens_used: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          model?: string | null;
          period_id: string;
          prompt_version?: string | null;
          run_id: string;
          summary: Json;
          tokens_used?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          model?: string | null;
          period_id?: string;
          prompt_version?: string | null;
          run_id?: string;
          summary?: Json;
          tokens_used?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "period_summaries_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "period_summaries_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      periods: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          kind: string;
          label: string;
          start_date: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          kind: string;
          label: string;
          start_date: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          kind?: string;
          label?: string;
          start_date?: string;
        };
        Relationships: [];
      };
      plan_targets: {
        Row: {
          baseline: number | null;
          comparator: string | null;
          created_at: string;
          id: string;
          key: string;
          label: string;
          plan: string | null;
          raw_import_id: string | null;
          source_needed: string | null;
          target: number | null;
          target_by: string | null;
          unit: string | null;
          where_target_comes_from: string | null;
        };
        Insert: {
          baseline?: number | null;
          comparator?: string | null;
          created_at?: string;
          id?: string;
          key: string;
          label: string;
          plan?: string | null;
          raw_import_id?: string | null;
          source_needed?: string | null;
          target?: number | null;
          target_by?: string | null;
          unit?: string | null;
          where_target_comes_from?: string | null;
        };
        Update: {
          baseline?: number | null;
          comparator?: string | null;
          created_at?: string;
          id?: string;
          key?: string;
          label?: string;
          plan?: string | null;
          raw_import_id?: string | null;
          source_needed?: string | null;
          target?: number | null;
          target_by?: string | null;
          unit?: string | null;
          where_target_comes_from?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "plan_targets_raw_import_id_fkey";
            columns: ["raw_import_id"];
            isOneToOne: false;
            referencedRelation: "raw_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      positioning: {
        Row: {
          audience: string | null;
          concept_description: string | null;
          concept_name: string | null;
          created_at: string;
          differentiation: string | null;
          id: string;
          known_for: string | null;
          objective: string | null;
          position_line: string | null;
          thesis: string | null;
          version_id: string;
        };
        Insert: {
          audience?: string | null;
          concept_description?: string | null;
          concept_name?: string | null;
          created_at?: string;
          differentiation?: string | null;
          id?: string;
          known_for?: string | null;
          objective?: string | null;
          position_line?: string | null;
          thesis?: string | null;
          version_id: string;
        };
        Update: {
          audience?: string | null;
          concept_description?: string | null;
          concept_name?: string | null;
          created_at?: string;
          differentiation?: string | null;
          id?: string;
          known_for?: string | null;
          objective?: string | null;
          position_line?: string | null;
          thesis?: string | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "positioning_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: true;
            referencedRelation: "strategy_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      post_aliases: {
        Row: {
          alias_urn: string;
          created_at: string;
          method: string;
          post_urn: string;
        };
        Insert: {
          alias_urn: string;
          created_at?: string;
          method: string;
          post_urn: string;
        };
        Update: {
          alias_urn?: string;
          created_at?: string;
          method?: string;
          post_urn?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_aliases_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "post_aliases_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "post_aliases_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
        ];
      };
      post_observations: {
        Row: {
          age_days: number;
          comments: number | null;
          created_at: string;
          engagements: number | null;
          followers_gained: number | null;
          id: string;
          impressions: number | null;
          link_clicks: number | null;
          members_reached: number | null;
          obs_window: string;
          observed_at: string;
          post_urn: string;
          profile_views: number | null;
          reactions: number | null;
          reposts: number | null;
          saves: number | null;
          sends: number | null;
          snapshot_id: string;
        };
        Insert: {
          age_days: number;
          comments?: number | null;
          created_at?: string;
          engagements?: number | null;
          followers_gained?: number | null;
          id?: string;
          impressions?: number | null;
          link_clicks?: number | null;
          members_reached?: number | null;
          obs_window: string;
          observed_at: string;
          post_urn: string;
          profile_views?: number | null;
          reactions?: number | null;
          reposts?: number | null;
          saves?: number | null;
          sends?: number | null;
          snapshot_id: string;
        };
        Update: {
          age_days?: number;
          comments?: number | null;
          created_at?: string;
          engagements?: number | null;
          followers_gained?: number | null;
          id?: string;
          impressions?: number | null;
          link_clicks?: number | null;
          members_reached?: number | null;
          obs_window?: string;
          observed_at?: string;
          post_urn?: string;
          profile_views?: number | null;
          reactions?: number | null;
          reposts?: number | null;
          saves?: number | null;
          sends?: number | null;
          snapshot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_observations_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "post_observations_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "post_observations_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_observations_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      posts: {
        Row: {
          concept: string | null;
          content_item_id: string | null;
          created_at: string;
          format: string | null;
          hook: string | null;
          length_chars: number | null;
          link_position: string | null;
          named_person: boolean | null;
          pillar_key: string | null;
          published_at: string;
          topic: string | null;
          url: string | null;
          urn: string;
          visual: string | null;
        };
        Insert: {
          concept?: string | null;
          content_item_id?: string | null;
          created_at?: string;
          format?: string | null;
          hook?: string | null;
          length_chars?: number | null;
          link_position?: string | null;
          named_person?: boolean | null;
          pillar_key?: string | null;
          published_at: string;
          topic?: string | null;
          url?: string | null;
          urn: string;
          visual?: string | null;
        };
        Update: {
          concept?: string | null;
          content_item_id?: string | null;
          created_at?: string;
          format?: string | null;
          hook?: string | null;
          length_chars?: number | null;
          link_position?: string | null;
          named_person?: boolean | null;
          pillar_key?: string | null;
          published_at?: string;
          topic?: string | null;
          url?: string | null;
          urn?: string;
          visual?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_content_item_id_fkey";
            columns: ["content_item_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      raw_imports: {
        Row: {
          created_at: string;
          drive_file_id: string | null;
          drive_file_name: string | null;
          id: string;
          payload: Json | null;
          period_hint: string | null;
          received_at: string;
          received_from: string | null;
          sha256: string;
          source_key: string;
          status: string;
          status_reason: string | null;
          storage_path: string | null;
        };
        Insert: {
          created_at?: string;
          drive_file_id?: string | null;
          drive_file_name?: string | null;
          id?: string;
          payload?: Json | null;
          period_hint?: string | null;
          received_at?: string;
          received_from?: string | null;
          sha256: string;
          source_key: string;
          status?: string;
          status_reason?: string | null;
          storage_path?: string | null;
        };
        Update: {
          created_at?: string;
          drive_file_id?: string | null;
          drive_file_name?: string | null;
          id?: string;
          payload?: Json | null;
          period_hint?: string | null;
          received_at?: string;
          received_from?: string | null;
          sha256?: string;
          source_key?: string;
          status?: string;
          status_reason?: string | null;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "raw_imports_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      reference_benchmarks: {
        Row: {
          as_of: string | null;
          created_at: string;
          description: string | null;
          key: string;
          source: string | null;
          unit: string | null;
          value: number | null;
        };
        Insert: {
          as_of?: string | null;
          created_at?: string;
          description?: string | null;
          key: string;
          source?: string | null;
          unit?: string | null;
          value?: number | null;
        };
        Update: {
          as_of?: string | null;
          created_at?: string;
          description?: string | null;
          key?: string;
          source?: string | null;
          unit?: string | null;
          value?: number | null;
        };
        Relationships: [];
      };
      run_steps: {
        Row: {
          created_at: string;
          details: Json | null;
          finished_at: string | null;
          id: string;
          message: string | null;
          run_id: string;
          started_at: string | null;
          status: string;
          step: string;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          finished_at?: string | null;
          id?: string;
          message?: string | null;
          run_id: string;
          started_at?: string | null;
          status: string;
          step: string;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          finished_at?: string | null;
          id?: string;
          message?: string | null;
          run_id?: string;
          started_at?: string | null;
          status?: string;
          step?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_state: {
        Row: {
          created_at: string;
          id: string;
          last_measured_period_id: string | null;
          lock_expires_at: string | null;
          lock_run_id: string | null;
          next_due: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_measured_period_id?: string | null;
          lock_expires_at?: string | null;
          lock_run_id?: string | null;
          next_due: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_measured_period_id?: string | null;
          lock_expires_at?: string | null;
          lock_run_id?: string | null;
          next_due?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "schedule_state_last_measured_period_id_fkey";
            columns: ["last_measured_period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "schedule_state_lock_run_id_fkey";
            columns: ["lock_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      snapshots: {
        Row: {
          captured_at: string;
          completeness: string;
          created_at: string;
          id: string;
          parser_version: string;
          period_id: string;
          raw_import_id: string | null;
          run_id: string;
          source_key: string;
          supersedes_id: string | null;
          transform_version: string;
        };
        Insert: {
          captured_at: string;
          completeness: string;
          created_at?: string;
          id?: string;
          parser_version: string;
          period_id: string;
          raw_import_id?: string | null;
          run_id: string;
          source_key: string;
          supersedes_id?: string | null;
          transform_version: string;
        };
        Update: {
          captured_at?: string;
          completeness?: string;
          created_at?: string;
          id?: string;
          parser_version?: string;
          period_id?: string;
          raw_import_id?: string | null;
          run_id?: string;
          source_key?: string;
          supersedes_id?: string | null;
          transform_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_raw_import_id_fkey";
            columns: ["raw_import_id"];
            isOneToOne: false;
            referencedRelation: "raw_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      source_capabilities: {
        Row: {
          available: string;
          created_at: string;
          id: string;
          metric_key: string;
          note: string | null;
          source_key: string;
          verified_on: string | null;
        };
        Insert: {
          available: string;
          created_at?: string;
          id?: string;
          metric_key: string;
          note?: string | null;
          source_key: string;
          verified_on?: string | null;
        };
        Update: {
          available?: string;
          created_at?: string;
          id?: string;
          metric_key?: string;
          note?: string | null;
          source_key?: string;
          verified_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_capabilities_metric_fk";
            columns: ["metric_key"];
            isOneToOne: false;
            referencedRelation: "metric_catalog";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_capabilities_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      sources: {
        Row: {
          created_at: string;
          key: string;
          label: string;
        };
        Insert: {
          created_at?: string;
          key: string;
          label: string;
        };
        Update: {
          created_at?: string;
          key?: string;
          label?: string;
        };
        Relationships: [];
      };
      strategy_versions: {
        Row: {
          change_note: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          valid_from: string;
          version_no: number;
        };
        Insert: {
          change_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          valid_from: string;
          version_no: number;
        };
        Update: {
          change_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          valid_from?: string;
          version_no?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      current_snapshots: {
        Row: {
          captured_at: string | null;
          completeness: string | null;
          created_at: string | null;
          id: string | null;
          parser_version: string | null;
          period_id: string | null;
          raw_import_id: string | null;
          run_id: string | null;
          source_key: string | null;
          supersedes_id: string | null;
          transform_version: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_raw_import_id_fkey";
            columns: ["raw_import_id"];
            isOneToOne: false;
            referencedRelation: "raw_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      v_audience_latest: {
        Row: {
          captured_at: string | null;
          dimension: string | null;
          label: string | null;
          scope: string | null;
          share_pct: number | null;
          source_key: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_current_leads: {
        Row: {
          attribution: string | null;
          calendar_event_id: string | null;
          date: string | null;
          id: string | null;
          kind: string | null;
          note: string | null;
          period_id: string | null;
          period_label: string | null;
          person_type: string | null;
          post_urn: string | null;
          snapshot_id: string | null;
          source_key: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_leads_by_period: {
        Row: {
          end_date: string | null;
          fully_covered: boolean | null;
          inquiries: number | null;
          intros: number | null;
          kind: string | null;
          label: string | null;
          leads: number | null;
          meetings: number | null;
          period_id: string | null;
          source_key: string | null;
          start_date: string | null;
        };
        Relationships: [];
      };
      v_manual_leads: {
        Row: {
          attribution: string | null;
          date: string | null;
          id: string | null;
          kind: string | null;
          note: string | null;
          period_id: string | null;
          period_label: string | null;
          person_type: string | null;
          post_urn: string | null;
          snapshot_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "leads_post_urn_fkey";
            columns: ["post_urn"];
            isOneToOne: false;
            referencedRelation: "v_post_metrics";
            referencedColumns: ["urn"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
        ];
      };
      v_monthly_account: {
        Row: {
          comments: number | null;
          days: number | null;
          impressions: number | null;
          link_clicks: number | null;
          members_reached: number | null;
          new_followers: number | null;
          reactions: number | null;
          reposts: number | null;
          saves: number | null;
          sends: number | null;
          source_key: string | null;
          window_end: string | null;
          window_start: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_period_audience: {
        Row: {
          below_one_pct: boolean | null;
          captured_at: string | null;
          completeness: string | null;
          dimension: string | null;
          label: string | null;
          label_raw: string | null;
          period_id: string | null;
          period_kind: string | null;
          period_label: string | null;
          scope: string | null;
          share_pct: number | null;
          source_key: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_period_followers: {
        Row: {
          days_covered: number | null;
          days_in_period: number | null;
          end_date: string | null;
          is_complete: boolean | null;
          kind: string | null;
          label: string | null;
          new_followers: number | null;
          period_id: string | null;
          source_key: string | null;
          start_date: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_period_impressions: {
        Row: {
          daily_complete: boolean | null;
          daily_engagements: number | null;
          daily_impressions: number | null;
          daily_source: string | null;
          days_covered: number | null;
          end_date: string | null;
          kind: string | null;
          label: string | null;
          period_id: string | null;
          range_complete: boolean | null;
          range_impressions: number | null;
          range_members_reached: number | null;
          range_source: string | null;
          start_date: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["range_source"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["daily_source"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_period_posts: {
        Row: {
          age_days: number | null;
          engagements: number | null;
          format: string | null;
          hook: string | null;
          impressions: number | null;
          observed_at: string | null;
          period_id: string | null;
          period_label: string | null;
          published_at: string | null;
          source_key: string | null;
          topic: string | null;
          url: string | null;
          urn: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_post_metrics: {
        Row: {
          age_days: number | null;
          followers_gained: number | null;
          followers_per_1000: number | null;
          format: string | null;
          hook: string | null;
          impressions: number | null;
          obs_window: string | null;
          observed_at: string | null;
          pillar_key: string | null;
          profile_views: number | null;
          published_at: string | null;
          reposts: number | null;
          saves: number | null;
          saves_reposts_per_1000: number | null;
          source_key: string | null;
          topic: string | null;
          url: string | null;
          urn: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_ranked_snapshots: {
        Row: {
          captured_at: string | null;
          complete_rank: number | null;
          completeness: string | null;
          created_at: string | null;
          id: string | null;
          parser_version: string | null;
          period_id: string | null;
          raw_import_id: string | null;
          run_id: string | null;
          source_key: string | null;
          source_rank: number | null;
          supersedes_id: string | null;
          transform_version: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_leads_by_period";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_audience";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_followers";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_impressions";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "v_period_posts";
            referencedColumns: ["period_id"];
          },
          {
            foreignKeyName: "snapshots_raw_import_id_fkey";
            columns: ["raw_import_id"];
            isOneToOne: false;
            referencedRelation: "raw_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "current_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_current_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_manual_leads";
            referencedColumns: ["snapshot_id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_ranked_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "snapshots_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "v_spot_checks";
            referencedColumns: ["snapshot_id"];
          },
        ];
      };
      v_source_capabilities_latest: {
        Row: {
          available: string | null;
          created_at: string | null;
          id: string | null;
          metric_key: string | null;
          note: string | null;
          source_key: string | null;
          verified_on: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "source_capabilities_metric_fk";
            columns: ["metric_key"];
            isOneToOne: false;
            referencedRelation: "metric_catalog";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "source_capabilities_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
      v_spot_checks: {
        Row: {
          broad_count: number | null;
          checked_on: string | null;
          id: string | null;
          method_version: string | null;
          none_count: number | null;
          period_label: string | null;
          sample_size: number | null;
          snapshot_id: string | null;
          snapshot_period_label: string | null;
          source_key: string | null;
          strict_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_source_key_fkey";
            columns: ["source_key"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["key"];
          },
        ];
      };
    };
    Functions: {
      commit_config_import: { Args: { payload: Json }; Returns: number };
      commit_run: { Args: { payload: Json }; Returns: Json };
      commit_snapshot: { Args: { payload: Json }; Returns: string };
      commit_snapshots: { Args: { payloads: Json }; Returns: string[] };
      is_allowed_user: { Args: never; Returns: boolean };
      register_raw_import: {
        Args: {
          p_from: string;
          p_hint: string;
          p_path: string;
          p_payload: Json;
          p_sha: string;
          p_source: string;
        };
        Returns: string;
      };
      run_claim_key: {
        Args: { p_claim: boolean; p_key: string; p_run: string };
        Returns: string;
      };
      run_finish: {
        Args: {
          p_issues: Json;
          p_raw_ids: string[];
          p_raw_status: string;
          p_records_read: number;
          p_run: string;
          p_status: string;
          p_summary: string;
        };
        Returns: undefined;
      };
      run_lock: { Args: { p_run: string }; Returns: boolean };
      run_start: {
        Args: { p_period: string; p_trigger: string; p_workflow: string };
        Returns: string;
      };
      run_step: {
        Args: {
          p_details: Json;
          p_message: string;
          p_run: string;
          p_started: string;
          p_status: string;
          p_step: string;
        };
        Returns: undefined;
      };
      save_strategy_version: { Args: { payload: Json }; Returns: string };
      test_foundation_invariants: { Args: never; Returns: Json };
      test_manual_lead_cycle: { Args: never; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

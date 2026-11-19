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
  eventplanner: {
    Tables: {
      budget_items: {
        Row: {
          actual: number | null
          category: string | null
          created_at: string
          estimated: number
          event_id: string
          id: string
          label: string
          notes: string | null
        }
        Insert: {
          actual?: number | null
          category?: string | null
          created_at?: string
          estimated?: number
          event_id: string
          id?: string
          label: string
          notes?: string | null
        }
        Update: {
          actual?: number | null
          category?: string | null
          created_at?: string
          estimated?: number
          event_id?: string
          id?: string
          label?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      document_text: {
        Row: {
          area_id: string | null
          content: string | null
          error: string | null
          event_id: string
          file_name: string | null
          id: string
          indexed_at: string
          path: string
          status: string
          superseded: boolean
        }
        Insert: {
          area_id?: string | null
          content?: string | null
          error?: string | null
          event_id: string
          file_name?: string | null
          id?: string
          indexed_at?: string
          path: string
          status: string
          superseded?: boolean
        }
        Update: {
          area_id?: string | null
          content?: string | null
          error?: string | null
          event_id?: string
          file_name?: string | null
          id?: string
          indexed_at?: string
          path?: string
          status?: string
          superseded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_text_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_area_meta: {
        Row: {
          area_id: string
          event_id: string
          id: string
          responsible_name: string | null
          responsible_user_id: string | null
          restricted_to: string | null
          review_due: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          updated_at: string
        }
        Insert: {
          area_id: string
          event_id: string
          id?: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          restricted_to?: string | null
          review_due?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          event_id?: string
          id?: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          restricted_to?: string | null
          review_due?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_area_meta_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_area_meta_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      event_changes: {
        Row: {
          area_id: string | null
          change_kind: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          event_id: string
          extra_section_id: string | null
          field_key: string | null
          field_label: string | null
          id: string
          section_id: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          change_kind?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          event_id: string
          extra_section_id?: string | null
          field_key?: string | null
          field_label?: string | null
          id?: string
          section_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          change_kind?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          event_id?: string
          extra_section_id?: string | null
          field_key?: string | null
          field_label?: string | null
          id?: string
          section_id?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_contacts: {
        Row: {
          contact_type: string | null
          created_at: string
          email: string | null
          event_id: string
          id: string
          kind: string
          lead_or_support: string | null
          name: string | null
          sort_order: number
        }
        Insert: {
          contact_type?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          kind?: string
          lead_or_support?: string | null
          name?: string | null
          sort_order?: number
        }
        Update: {
          contact_type?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          kind?: string
          lead_or_support?: string | null
          name?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_contacts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_custom_fields: {
        Row: {
          allow_na: boolean
          created_at: string
          created_by: string | null
          default_table: Json | null
          event_id: string
          extra_section_id: string | null
          help_text: string | null
          id: string
          is_required: boolean
          key: string
          kind: string
          label: string
          multiline: boolean
          section_id: string | null
          sort_order: number
          table_rules: Json | null
        }
        Insert: {
          allow_na?: boolean
          created_at?: string
          created_by?: string | null
          default_table?: Json | null
          event_id: string
          extra_section_id?: string | null
          help_text?: string | null
          id?: string
          is_required?: boolean
          key: string
          kind: string
          label: string
          multiline?: boolean
          section_id?: string | null
          sort_order?: number
          table_rules?: Json | null
        }
        Update: {
          allow_na?: boolean
          created_at?: string
          created_by?: string | null
          default_table?: Json | null
          event_id?: string
          extra_section_id?: string | null
          help_text?: string | null
          id?: string
          is_required?: boolean
          key?: string
          kind?: string
          label?: string
          multiline?: boolean
          section_id?: string | null
          sort_order?: number
          table_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "event_custom_fields_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_custom_fields_extra_section_id_fkey"
            columns: ["extra_section_id"]
            isOneToOne: false
            referencedRelation: "event_section_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_custom_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      event_deliverables: {
        Row: {
          created_at: string
          description: string
          event_id: string
          id: string
          owner: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description: string
          event_id: string
          id?: string
          owner?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          owner?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_emergency_services: {
        Row: {
          contact: string | null
          created_at: string
          event_id: string
          id: string
          on_site: boolean
          service: string
          sort_order: number
        }
        Insert: {
          contact?: string | null
          created_at?: string
          event_id: string
          id?: string
          on_site?: boolean
          service: string
          sort_order?: number
        }
        Update: {
          contact?: string | null
          created_at?: string
          event_id?: string
          id?: string
          on_site?: boolean
          service?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_emergency_services_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_entrant_info: {
        Row: {
          answer: string | null
          created_at: string
          event_id: string
          id: string
          question: string
          sort_order: number
        }
        Insert: {
          answer?: string | null
          created_at?: string
          event_id: string
          id?: string
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string | null
          created_at?: string
          event_id?: string
          id?: string
          question?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_entrant_info_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_field_values: {
        Row: {
          event_id: string
          extra_section_id: string | null
          field_key: string
          id: string
          kind: string
          label: string | null
          not_applicable: boolean
          section_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          value_kv: Json | null
          value_links: Json | null
          value_table: Json | null
          value_text: string | null
          version: number
        }
        Insert: {
          event_id: string
          extra_section_id?: string | null
          field_key: string
          id?: string
          kind: string
          label?: string | null
          not_applicable?: boolean
          section_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value_kv?: Json | null
          value_links?: Json | null
          value_table?: Json | null
          value_text?: string | null
          version?: number
        }
        Update: {
          event_id?: string
          extra_section_id?: string | null
          field_key?: string
          id?: string
          kind?: string
          label?: string | null
          not_applicable?: boolean
          section_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value_kv?: Json | null
          value_links?: Json | null
          value_table?: Json | null
          value_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_field_values_extra_section_id_fkey"
            columns: ["extra_section_id"]
            isOneToOne: false
            referencedRelation: "event_section_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_field_values_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      event_files: {
        Row: {
          created_at: string
          event_id: string
          id: string
          label: string
          section_key: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          label: string
          section_key?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          section_key?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_files_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          access_level: string
          created_at: string
          event_id: string
          id: string
          needs_review: boolean
          review_note: string | null
          role_on_event: string | null
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          event_id: string
          id?: string
          needs_review?: boolean
          review_note?: string | null
          role_on_event?: string | null
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          event_id?: string
          id?: string
          needs_review?: boolean
          review_note?: string | null
          role_on_event?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          event_id: string
          id: string
          section_key: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          event_id: string
          id?: string
          section_key?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          section_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_pins: {
        Row: {
          area_id: string | null
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          label: string
          pin_kind: string
          sort_order: number
          target: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          label: string
          pin_kind: string
          sort_order?: number
          target: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          label?: string
          pin_kind?: string
          sort_order?: number
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_pins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_power_pricing: {
        Row: {
          cost: string | null
          created_at: string
          event_id: string
          id: string
          outlet_type: string
          sort_order: number
        }
        Insert: {
          cost?: string | null
          created_at?: string
          event_id: string
          id?: string
          outlet_type: string
          sort_order?: number
        }
        Update: {
          cost?: string | null
          created_at?: string
          event_id?: string
          id?: string
          outlet_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_power_pricing_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_revisions: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          event_id: string
          id: string
          note: string
          revised_on: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          event_id: string
          id?: string
          note: string
          revised_on?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          event_id?: string
          id?: string
          note?: string
          revised_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_revisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_roles: {
        Row: {
          created_at: string
          email: string | null
          event_id: string
          id: string
          is_event_control: boolean
          is_media_spokesperson: boolean
          name: string
          role: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          is_event_control?: boolean
          is_media_spokesperson?: boolean
          name: string
          role: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          is_event_control?: boolean
          is_media_spokesperson?: boolean
          name?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_schedule_blocks: {
        Row: {
          created_at: string
          date: string | null
          event_id: string
          finish_time: string | null
          id: string
          kind: string
          location: string | null
          notes: string | null
          sort_order: number
          start_time: string | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          event_id: string
          finish_time?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
        }
        Update: {
          created_at?: string
          date?: string | null
          event_id?: string
          finish_time?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_schedule_blocks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_section_extras: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          id: string
          parent_section_id: string | null
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: string
          parent_section_id?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: string
          parent_section_id?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_section_extras_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      event_section_overrides: {
        Row: {
          created_at: string
          event_id: string
          hidden: boolean
          id: string
          section_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          event_id: string
          hidden?: boolean
          id?: string
          section_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          hidden?: boolean
          id?: string
          section_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_section_overrides_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          category_id: string | null
          created_at: string
          default_milestones: Json
          default_sections: Json
          default_tasks: Json
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_milestones?: Json
          default_sections?: Json
          default_tasks?: Json
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_milestones?: Json
          default_sections?: Json
          default_tasks?: Json
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          audience: string
          created_at: string
          event_id: string
          id: string
          name: string
          notes: string | null
          price: string | null
          sort_order: number
        }
        Insert: {
          audience?: string
          created_at?: string
          event_id: string
          id?: string
          name: string
          notes?: string | null
          price?: string | null
          sort_order?: number
        }
        Update: {
          audience?: string
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          price?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          accreditation_notes: string | null
          archived_at: string | null
          archived_by: string | null
          awards_notes: string | null
          budget_estimate: number | null
          bump_in_start: string | null
          bump_out_end: string | null
          camping_available: boolean | null
          camping_notes: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          entrant_terms_url: string | null
          event_dates_text: string | null
          expected_attendance: number | null
          floor_plan_url: string | null
          id: string
          judging_notes: string | null
          lead_user_id: string | null
          location: string | null
          logo_url: string | null
          marketing_summary: string | null
          media_notes: string | null
          name: string
          onsite_parking_notes: string | null
          organising_entity: string | null
          progress_pct: number
          proposed_date: string | null
          public_transport_notes: string | null
          purpose: string | null
          sections: Json
          stage: Database["eventplanner"]["Enums"]["event_stage"]
          template_id: string | null
          updated_at: string
          venue: string | null
          workspace_links: Json
        }
        Insert: {
          accreditation_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          awards_notes?: string | null
          budget_estimate?: number | null
          bump_in_start?: string | null
          bump_out_end?: string | null
          camping_available?: boolean | null
          camping_notes?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entrant_terms_url?: string | null
          event_dates_text?: string | null
          expected_attendance?: number | null
          floor_plan_url?: string | null
          id?: string
          judging_notes?: string | null
          lead_user_id?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_summary?: string | null
          media_notes?: string | null
          name: string
          onsite_parking_notes?: string | null
          organising_entity?: string | null
          progress_pct?: number
          proposed_date?: string | null
          public_transport_notes?: string | null
          purpose?: string | null
          sections?: Json
          stage?: Database["eventplanner"]["Enums"]["event_stage"]
          template_id?: string | null
          updated_at?: string
          venue?: string | null
          workspace_links?: Json
        }
        Update: {
          accreditation_notes?: string | null
          archived_at?: string | null
          archived_by?: string | null
          awards_notes?: string | null
          budget_estimate?: number | null
          bump_in_start?: string | null
          bump_out_end?: string | null
          camping_available?: boolean | null
          camping_notes?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entrant_terms_url?: string | null
          event_dates_text?: string | null
          expected_attendance?: number | null
          floor_plan_url?: string | null
          id?: string
          judging_notes?: string | null
          lead_user_id?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_summary?: string | null
          media_notes?: string | null
          name?: string
          onsite_parking_notes?: string | null
          organising_entity?: string | null
          progress_pct?: number
          proposed_date?: string | null
          public_transport_notes?: string | null
          purpose?: string | null
          sections?: Json
          stage?: Database["eventplanner"]["Enums"]["event_stage"]
          template_id?: string | null
          updated_at?: string
          venue?: string | null
          workspace_links?: Json
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      ops_documents: {
        Row: {
          category_id: string | null
          content: string | null
          created_at: string
          description: string | null
          error: string | null
          event_id: string | null
          file_name: string
          file_size: number | null
          id: string
          pages: Json | null
          sections: Json | null
          status: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          error?: string | null
          event_id?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          pages?: Json | null
          sections?: Json | null
          status?: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          error?: string | null
          event_id?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          pages?: Json | null
          sections?: Json | null
          status?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ops_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      risks: {
        Row: {
          created_at: string
          event_id: string
          id: string
          impact: Database["eventplanner"]["Enums"]["risk_level"]
          likelihood: Database["eventplanner"]["Enums"]["risk_level"]
          mitigation: string | null
          owner_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          impact?: Database["eventplanner"]["Enums"]["risk_level"]
          likelihood?: Database["eventplanner"]["Enums"]["risk_level"]
          mitigation?: string | null
          owner_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          impact?: Database["eventplanner"]["Enums"]["risk_level"]
          likelihood?: Database["eventplanner"]["Enums"]["risk_level"]
          mitigation?: string | null
          owner_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          category: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          cost_estimate: number | null
          created_at: string
          event_id: string
          id: string
          name: string
          notes: string | null
          status: Database["eventplanner"]["Enums"]["supplier_status"]
        }
        Insert: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cost_estimate?: number | null
          created_at?: string
          event_id: string
          id?: string
          name: string
          notes?: string | null
          status?: Database["eventplanner"]["Enums"]["supplier_status"]
        }
        Update: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          cost_estimate?: number | null
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          status?: Database["eventplanner"]["Enums"]["supplier_status"]
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          event_id: string
          id: string
          owner_id: string | null
          priority: Database["eventplanner"]["Enums"]["task_priority"]
          section_key: string | null
          status: Database["eventplanner"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          owner_id?: string | null
          priority?: Database["eventplanner"]["Enums"]["task_priority"]
          section_key?: string | null
          status?: Database["eventplanner"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          owner_id?: string | null
          priority?: Database["eventplanner"]["Enums"]["task_priority"]
          section_key?: string | null
          status?: Database["eventplanner"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      template_fields: {
        Row: {
          allow_na: boolean
          archived_at: string | null
          created_at: string
          default_table: Json | null
          help_text: string | null
          id: string
          is_required: boolean
          key: string
          kind: string
          label: string
          multiline: boolean
          options: Json | null
          section_id: string
          sort_order: number
          table_rules: Json | null
        }
        Insert: {
          allow_na?: boolean
          archived_at?: string | null
          created_at?: string
          default_table?: Json | null
          help_text?: string | null
          id?: string
          is_required?: boolean
          key: string
          kind: string
          label: string
          multiline?: boolean
          options?: Json | null
          section_id: string
          sort_order?: number
          table_rules?: Json | null
        }
        Update: {
          allow_na?: boolean
          archived_at?: string | null
          created_at?: string
          default_table?: Json | null
          help_text?: string | null
          id?: string
          is_required?: boolean
          key?: string
          kind?: string
          label?: string
          multiline?: boolean
          options?: Json | null
          section_id?: string
          sort_order?: number
          table_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "template_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          nav_group: string | null
          parent_id: string | null
          restricted_to: string | null
          show_in_wizard: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          nav_group?: string | null
          parent_id?: string | null
          restricted_to?: string | null
          show_in_wizard?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          nav_group?: string | null
          parent_id?: string | null
          restricted_to?: string | null
          show_in_wizard?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_milestones: {
        Row: {
          created_at: string
          date: string | null
          event_id: string
          id: string
          milestone_type: string | null
          notes: string | null
          sort_order: number
          status: Database["eventplanner"]["Enums"]["milestone_status"]
          title: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          event_id: string
          id?: string
          milestone_type?: string | null
          notes?: string | null
          sort_order?: number
          status?: Database["eventplanner"]["Enums"]["milestone_status"]
          title: string
        }
        Update: {
          created_at?: string
          date?: string | null
          event_id?: string
          id?: string
          milestone_type?: string | null
          notes?: string | null
          sort_order?: number
          status?: Database["eventplanner"]["Enums"]["milestone_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_milestones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["eventplanner"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["eventplanner"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["eventplanner"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_member: { Args: never; Returns: boolean }
      event_directory: {
        Args: never
        Returns: {
          end_date: string | null
          id: string
          name: string
          stage: string
          start_date: string | null
          venue: string | null
        }[]
      }
      importing: { Args: never; Returns: boolean }
      can_view_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      event_area_permissions: {
        Args: { _event_id: string }
        Returns: {
          area_id: string
          can_read: boolean
          restricted_to: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["eventplanner"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_event_member: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      my_area_permissions: {
        Args: never
        Returns: {
          area_id: string
          can_read: boolean
          event_id: string
          restricted_to: string
        }[]
      }
      my_event_access: {
        Args: never
        Returns: {
          access: string
          event_id: string
          is_staff: boolean
        }[]
      }
      search_document_text: {
        Args: { _event_id?: string; _q: string }
        Returns: {
          area_id: string
          event_id: string
          file_name: string
          path: string
          snippet: string
        }[]
      }
      search_event_values: {
        Args: { _event_id?: string; _q: string }
        Returns: {
          event_id: string
          extra_section_id: string | null
          field_key: string
          id: string
          kind: string
          label: string | null
          not_applicable: boolean
          section_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          value_kv: Json | null
          value_links: Json | null
          value_table: Json | null
          value_text: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "event_field_values"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_ops_documents: {
        Args: { _all_events?: boolean; _event_id?: string; _q: string }
        Returns: {
          category_id: string
          category_name: string
          event_id: string
          event_name: string
          file_name: string
          id: string
          in_title: boolean
          snippet: string
          title: string
        }[]
      }
      user_event_access: {
        Args: { _user_id: string }
        Returns: {
          access: string
          event_id: string
          event_name: string
          restricted_areas: number
          source: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "lead" | "member" | "supplier" | "viewer"
      event_stage:
        | "draft"
        | "in_planning"
        | "confirmed"
        | "delivery_ready"
        | "live"
        | "completed"
        | "archived"
      milestone_status: "pending" | "in_progress" | "done" | "missed"
      risk_level: "low" | "medium" | "high" | "critical"
      supplier_status:
        | "prospect"
        | "contacted"
        | "quoted"
        | "booked"
        | "confirmed"
        | "cancelled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "blocked" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "eventplanner">]

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
  eventplanner: {
    Enums: {
      app_role: ["admin", "lead", "member", "supplier", "viewer"],
      event_stage: [
        "draft",
        "in_planning",
        "confirmed",
        "delivery_ready",
        "live",
        "completed",
        "archived",
      ],
      milestone_status: ["pending", "in_progress", "done", "missed"],
      risk_level: ["low", "medium", "high", "critical"],
      supplier_status: [
        "prospect",
        "contacted",
        "quoted",
        "booked",
        "confirmed",
        "cancelled",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "blocked", "done"],
    },
  },
} as const

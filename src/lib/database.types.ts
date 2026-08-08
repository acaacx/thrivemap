export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      clinic_age_groups: {
        Row: {
          age_group: Database["public"]["Enums"]["age_group"]
          clinic_id: string
          created_at: string
          id: string
        }
        Insert: {
          age_group: Database["public"]["Enums"]["age_group"]
          clinic_id: string
          created_at?: string
          id?: string
        }
        Update: {
          age_group?: Database["public"]["Enums"]["age_group"]
          clinic_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_age_groups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_change_requests: {
        Row: {
          changes: Json
          clinic_id: string
          created_at: string
          id: string
          message: string | null
          requested_by: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["change_request_status"]
          updated_at: string
        }
        Insert: {
          changes?: Json
          clinic_id: string
          created_at?: string
          id?: string
          message?: string | null
          requested_by?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string
        }
        Update: {
          changes?: Json
          clinic_id?: string
          created_at?: string
          id?: string
          message?: string | null
          requested_by?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_change_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_claim_documents: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          kind: string
          original_filename: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          kind: string
          original_filename?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          kind?: string
          original_filename?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_claim_documents_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "clinic_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_claims: {
        Row: {
          additional_info_request: string | null
          business_registration_info: string | null
          clinic_id: string
          consent_given: boolean
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          full_name: string
          id: string
          job_title: string
          mobile_number: string
          relationship: string
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
          user_id: string
          work_email: string
        }
        Insert: {
          additional_info_request?: string | null
          business_registration_info?: string | null
          clinic_id: string
          consent_given?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          full_name?: string
          id?: string
          job_title?: string
          mobile_number?: string
          relationship?: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
          user_id: string
          work_email?: string
        }
        Update: {
          additional_info_request?: string | null
          business_registration_info?: string | null
          clinic_id?: string
          consent_given?: boolean
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          full_name?: string
          id?: string
          job_title?: string
          mobile_number?: string
          relationship?: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
          user_id?: string
          work_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_claims_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_contact_methods: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          kind: string
          label: string | null
          sort_order: number
          value: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          sort_order?: number
          value: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_contact_methods_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_hours: {
        Row: {
          clinic_id: string
          closes_at: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          opens_at: string | null
        }
        Insert: {
          clinic_id: string
          closes_at?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          opens_at?: string | null
        }
        Update: {
          clinic_id?: string
          closes_at?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          opens_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_hours_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_images: {
        Row: {
          alt_text: string
          clinic_id: string
          created_at: string
          id: string
          kind: string
          sort_order: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string
          clinic_id: string
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string
          clinic_id?: string
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_images_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_languages: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          language: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          language: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          language?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_languages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_locations: {
        Row: {
          address_line1: string
          address_line2: string | null
          barangay: string | null
          city: string
          city_slug: string
          clinic_id: string
          country_code: string
          created_at: string
          id: string
          is_primary: boolean
          landmark: string | null
          latitude: number | null
          location: unknown
          longitude: number | null
          postal_code: string | null
          province: string
          province_slug: string
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          barangay?: string | null
          city: string
          city_slug: string
          clinic_id: string
          country_code?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          landmark?: string | null
          latitude?: number | null
          location: unknown
          longitude?: number | null
          postal_code?: string | null
          province: string
          province_slug: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          barangay?: string | null
          city?: string
          city_slug?: string
          clinic_id?: string
          country_code?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          landmark?: string | null
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          postal_code?: string | null
          province?: string
          province_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_locations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_managers: {
        Row: {
          clinic_id: string
          created_at: string
          granted_by: string | null
          granted_via_claim_id: string | null
          id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          granted_by?: string | null
          granted_via_claim_id?: string | null
          id?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          granted_by?: string | null
          granted_via_claim_id?: string | null
          id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_managers_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_managers_granted_via_claim_id_fkey"
            columns: ["granted_via_claim_id"]
            isOneToOne: false
            referencedRelation: "clinic_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_rating_stats: {
        Row: {
          avg_affirming_approach: number
          avg_communication: number
          avg_scheduling: number
          avg_sensory_friendliness: number
          clinic_id: string
          rating_count: number
          updated_at: string
        }
        Insert: {
          avg_affirming_approach: number
          avg_communication: number
          avg_scheduling: number
          avg_sensory_friendliness: number
          clinic_id: string
          rating_count: number
          updated_at?: string
        }
        Update: {
          avg_affirming_approach?: number
          avg_communication?: number
          avg_scheduling?: number
          avg_sensory_friendliness?: number
          clinic_id?: string
          rating_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_rating_stats_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_ratings: {
        Row: {
          affirming_approach: number
          clinic_id: string
          communication: number
          created_at: string
          id: string
          scheduling: number
          sensory_friendliness: number
          updated_at: string
          user_id: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          affirming_approach: number
          clinic_id: string
          communication: number
          created_at?: string
          id?: string
          scheduling: number
          sensory_friendliness: number
          updated_at?: string
          user_id: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          affirming_approach?: number
          clinic_id?: string
          communication?: number
          created_at?: string
          id?: string
          scheduling?: number
          sensory_friendliness?: number
          updated_at?: string
          user_id?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ratings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_reports: {
        Row: {
          clinic_id: string
          created_at: string
          details: string | null
          id: string
          inquiry_id: string | null
          report_type: Database["public"]["Enums"]["report_type"]
          reported_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          details?: string | null
          id?: string
          inquiry_id?: string | null
          report_type: Database["public"]["Enums"]["report_type"]
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          details?: string | null
          id?: string
          inquiry_id?: string | null
          report_type?: Database["public"]["Enums"]["report_type"]
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_reports_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_reports_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_search_documents: {
        Row: {
          clinic_id: string
          name_normalized: string
          refreshed_at: string
          search_vector: unknown
        }
        Insert: {
          clinic_id: string
          name_normalized: string
          refreshed_at?: string
          search_vector: unknown
        }
        Update: {
          clinic_id?: string
          name_normalized?: string
          refreshed_at?: string
          search_vector?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "clinic_search_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_services: {
        Row: {
          clinic_id: string
          created_at: string
          delivery: Database["public"]["Enums"]["service_delivery"][]
          id: string
          notes: string | null
          service_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          delivery?: Database["public"]["Enums"]["service_delivery"][]
          id?: string
          notes?: string | null
          service_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          delivery?: Database["public"]["Enums"]["service_delivery"][]
          id?: string
          notes?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_social_links: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          platform: string
          url: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          platform: string
          url: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          platform?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_social_links_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_source_records: {
        Row: {
          clinic_id: string
          created_at: string
          external_id: string | null
          fetched_at: string
          id: string
          provider: string | null
          raw_payload: Json
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Insert: {
          clinic_id: string
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          provider?: string | null
          raw_payload?: Json
          source_type: Database["public"]["Enums"]["source_type"]
        }
        Update: {
          clinic_id?: string
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          id?: string
          provider?: string | null
          raw_payload?: Json
          source_type?: Database["public"]["Enums"]["source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "clinic_source_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_submissions: {
        Row: {
          address: string
          clinic_name: string
          consent_given: boolean
          created_at: string
          created_clinic_id: string | null
          duplicate_of_clinic_id: string | null
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          phone: string | null
          reference_links: string[]
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_slugs: string[]
          social_media_url: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_by: string | null
          submitter_email: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address: string
          clinic_name: string
          consent_given?: boolean
          created_at?: string
          created_clinic_id?: string | null
          duplicate_of_clinic_id?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          reference_links?: string[]
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_slugs?: string[]
          social_media_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by?: string | null
          submitter_email?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string
          clinic_name?: string
          consent_given?: boolean
          created_at?: string
          created_clinic_id?: string | null
          duplicate_of_clinic_id?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          reference_links?: string[]
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_slugs?: string[]
          social_media_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by?: string | null
          submitter_email?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_submissions_created_clinic_id_fkey"
            columns: ["created_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_submissions_duplicate_of_clinic_id_fkey"
            columns: ["duplicate_of_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_therapists: {
        Row: {
          bio: string | null
          clinic_id: string
          created_at: string
          credentials: string | null
          display_order: number
          full_name: string
          id: string
          photo_path: string | null
          profession: string
          specialties: string[]
          updated_at: string
        }
        Insert: {
          bio?: string | null
          clinic_id: string
          created_at?: string
          credentials?: string | null
          display_order?: number
          full_name: string
          id?: string
          photo_path?: string | null
          profession: string
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          bio?: string | null
          clinic_id?: string
          created_at?: string
          credentials?: string | null
          display_order?: number
          full_name?: string
          id?: string
          photo_path?: string | null
          profession?: string
          specialties?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_therapists_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_verification_events: {
        Row: {
          actor_id: string | null
          clinic_id: string
          created_at: string
          event: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          clinic_id: string
          created_at?: string
          event: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "clinic_verification_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_verification_records: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          verified_at: string
          verified_by: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          verified_at?: string
          verified_by: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_verification_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          accessibility_notes: string | null
          aliases: string[]
          claimed_by: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          email: string | null
          flagged_stale_at: string | null
          google_place_id: string | null
          id: string
          is_demo: boolean
          is_featured: boolean
          last_verified_at: string | null
          logo_url: string | null
          merged_into_clinic_id: string | null
          name: string
          offers_in_person_services: boolean
          offers_online_services: boolean
          phone: string | null
          slug: string
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          updated_by: string | null
          verified_by: string | null
          website: string | null
          wheelchair_accessible: boolean | null
        }
        Insert: {
          accessibility_notes?: string | null
          aliases?: string[]
          claimed_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          flagged_stale_at?: string | null
          google_place_id?: string | null
          id?: string
          is_demo?: boolean
          is_featured?: boolean
          last_verified_at?: string | null
          logo_url?: string | null
          merged_into_clinic_id?: string | null
          name: string
          offers_in_person_services?: boolean
          offers_online_services?: boolean
          phone?: string | null
          slug: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          updated_by?: string | null
          verified_by?: string | null
          website?: string | null
          wheelchair_accessible?: boolean | null
        }
        Update: {
          accessibility_notes?: string | null
          aliases?: string[]
          claimed_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          flagged_stale_at?: string | null
          google_place_id?: string | null
          id?: string
          is_demo?: boolean
          is_featured?: boolean
          last_verified_at?: string | null
          logo_url?: string | null
          merged_into_clinic_id?: string | null
          name?: string
          offers_in_person_services?: boolean
          offers_online_services?: boolean
          phone?: string | null
          slug?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          updated_by?: string | null
          verified_by?: string | null
          website?: string | null
          wheelchair_accessible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "clinics_merged_into_clinic_id_fkey"
            columns: ["merged_into_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_match_candidates: {
        Row: {
          clinic_a_id: string
          clinic_b_id: string
          created_at: string
          id: string
          matching_fields: Json
          resolved_at: string | null
          resolved_by: string | null
          similarity_score: number
          status: Database["public"]["Enums"]["duplicate_status"]
        }
        Insert: {
          clinic_a_id: string
          clinic_b_id: string
          created_at?: string
          id?: string
          matching_fields?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          similarity_score: number
          status?: Database["public"]["Enums"]["duplicate_status"]
        }
        Update: {
          clinic_a_id?: string
          clinic_b_id?: string
          created_at?: string
          id?: string
          matching_fields?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          similarity_score?: number
          status?: Database["public"]["Enums"]["duplicate_status"]
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_match_candidates_clinic_a_id_fkey"
            columns: ["clinic_a_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_match_candidates_clinic_b_id_fkey"
            columns: ["clinic_b_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      external_place_candidates: {
        Row: {
          created_at: string
          external_id: string
          id: string
          latitude: number | null
          longitude: number | null
          normalized_address: string | null
          normalized_name: string | null
          promoted_clinic_id: string | null
          provider: string
          raw_payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["candidate_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_address?: string | null
          normalized_name?: string | null
          promoted_clinic_id?: string | null
          provider?: string
          raw_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_address?: string | null
          normalized_name?: string | null
          promoted_clinic_id?: string | null
          provider?: string
          raw_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_place_candidates_promoted_clinic_id_fkey"
            columns: ["promoted_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          clinic_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          caregiver_id: string
          clinic_id: string
          confirmed_date: string | null
          created_at: string
          id: string
          preferred_date: string | null
          preferred_time_note: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          caregiver_id: string
          clinic_id: string
          confirmed_date?: string | null
          created_at?: string
          id?: string
          preferred_date?: string | null
          preferred_time_note?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          caregiver_id?: string
          clinic_id?: string
          confirmed_date?: string | null
          created_at?: string
          id?: string
          preferred_date?: string | null
          preferred_time_note?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          inquiry_id: string
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      ph_locations: {
        Row: {
          barangay: string | null
          centroid: unknown
          city: string | null
          city_slug: string | null
          created_at: string
          id: string
          kind: string
          province: string
          province_slug: string
          search_name: string
        }
        Insert: {
          barangay?: string | null
          centroid: unknown
          city?: string | null
          city_slug?: string | null
          created_at?: string
          id?: string
          kind: string
          province: string
          province_slug: string
          search_name: string
        }
        Update: {
          barangay?: string | null
          centroid?: unknown
          city?: string | null
          city_slug?: string | null
          created_at?: string
          id?: string
          kind?: string
          province?: string
          province_slug?: string
          search_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          short_description: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          short_description?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          short_description?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          email_notifications: boolean
          preferred_language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_notifications?: boolean
          preferred_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_notifications?: boolean
          preferred_language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
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
      attach_candidate: {
        Args: { p_candidate_id: string; p_clinic_id: string }
        Returns: undefined
      }
      can_report_inquiry: {
        Args: { p_clinic_id: string; p_inquiry_id: string }
        Returns: boolean
      }
      claim_due_jobs: {
        Args: { p_batch?: number; p_worker: string }
        Returns: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_at: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clinic_managed_or_admin: {
        Args: { p_clinic_id: string }
        Returns: boolean
      }
      clinic_publicly_readable: {
        Args: { p_clinic_id: string }
        Returns: boolean
      }
      clinic_readable_or_managed: {
        Args: { p_clinic_id: string }
        Returns: boolean
      }
      create_inquiry: {
        Args: {
          p_body: string
          p_clinic_id: string
          p_preferred_date?: string
          p_preferred_time_note?: string
          p_subject: string
        }
        Returns: string
      }
      find_duplicate_candidates: {
        Args: {
          p_clinic_id: string
          p_distance_m?: number
          p_name_similarity?: number
        }
        Returns: {
          distance_m: number
          name_similarity: number
          other_clinic_id: string
          same_phone: boolean
          same_place_id: boolean
          same_website_domain: boolean
        }[]
      }
      get_map_clinics: {
        Args: {
          p_east: number
          p_limit?: number
          p_north: number
          p_service_slugs?: string[]
          p_south: number
          p_verified_only?: boolean
          p_west: number
        }
        Returns: {
          clinic_id: string
          latitude: number
          longitude: number
          name: string
          slug: string
          status: Database["public"]["Enums"]["listing_status"]
        }[]
      }
      get_reported_inquiry_thread: {
        Args: { p_report_id: string }
        Returns: Json
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_active_clinic_manager: {
        Args: { p_clinic_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_clinic_open_at: {
        Args: { p_at?: string; p_clinic_id: string }
        Returns: boolean
      }
      is_moderator_or_admin: { Args: never; Returns: boolean }
      is_publicly_visible: {
        Args: { p_status: Database["public"]["Enums"]["listing_status"] }
        Returns: boolean
      }
      is_valid_listing_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["listing_status"]
          p_to: Database["public"]["Enums"]["listing_status"]
        }
        Returns: boolean
      }
      manages_clinic: { Args: { p_clinic_id: string }; Returns: boolean }
      match_candidate_clinics: {
        Args: {
          p_candidate_id: string
          p_distance_m?: number
          p_name_similarity?: number
        }
        Returns: {
          clinic_id: string
          clinic_name: string
          clinic_slug: string
          distance_m: number
          name_similarity: number
          same_place_id: boolean
        }[]
      }
      merge_clinics: {
        Args: { p_keep_id: string; p_merge_id: string; p_reason: string }
        Returns: undefined
      }
      nearest_ph_city: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          city: string
          city_slug: string
          distance_m: number
          province: string
          province_slug: string
        }[]
      }
      promote_candidate: { Args: { p_candidate_id: string }; Returns: string }
      refresh_all_clinic_search_documents: { Args: never; Returns: number }
      refresh_clinic_search_document: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
      reply_inquiry: {
        Args: { p_body: string; p_inquiry_id: string }
        Returns: string
      }
      requeue_stuck_jobs: { Args: never; Returns: number }
      scan_duplicate_candidates: {
        Args: {
          p_clinic_id?: string
          p_distance_m?: number
          p_name_similarity?: number
        }
        Returns: number
      }
      search_clinics: {
        Args: {
          p_accessible_only?: boolean
          p_age_groups?: Database["public"]["Enums"]["age_group"][]
          p_cursor_id?: string
          p_cursor_text?: string
          p_cursor_value?: number
          p_east?: number
          p_in_person_services?: boolean
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_north?: number
          p_online_services?: boolean
          p_open_now?: boolean
          p_query?: string
          p_radius_km?: number
          p_service_slugs?: string[]
          p_sort?: string
          p_south?: number
          p_verified_only?: boolean
          p_west?: number
        }
        Returns: {
          address_line1: string
          barangay: string
          city: string
          clinic_id: string
          description: string
          distance_km: number
          is_open_now: boolean
          last_verified_at: string
          latitude: number
          logo_url: string
          longitude: number
          name: string
          offers_in_person_services: boolean
          offers_online_services: boolean
          phone: string
          province: string
          rank: number
          service_names: string[]
          service_slugs: string[]
          slug: string
          sort_text: string
          sort_value: number
          status: Database["public"]["Enums"]["listing_status"]
          website: string
          wheelchair_accessible: boolean
        }[]
      }
      search_ph_locations: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          city_slug: string
          id: string
          kind: string
          label: string
          latitude: number
          longitude: number
          province_slug: string
          score: number
        }[]
      }
      set_inquiry_status: {
        Args: {
          p_confirmed_date?: string
          p_inquiry_id: string
          p_status: Database["public"]["Enums"]["inquiry_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      age_group:
        | "infants"
        | "toddlers"
        | "preschool"
        | "school_age"
        | "teenagers"
        | "adults"
      app_role:
        | "user"
        | "clinic_representative"
        | "moderator"
        | "administrator"
        | "super_administrator"
      candidate_status: "new" | "under_review" | "promoted" | "discarded"
      change_request_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "partially_approved"
      claim_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "additional_information_required"
        | "approved"
        | "rejected"
        | "revoked"
      duplicate_status:
        | "pending"
        | "confirmed_duplicate"
        | "not_duplicate"
        | "merged"
      inquiry_status: "open" | "replied" | "confirmed" | "declined" | "closed"
      job_status: "pending" | "running" | "completed" | "failed" | "dead"
      listing_status:
        | "draft"
        | "candidate"
        | "pending_review"
        | "published_unverified"
        | "published_verified"
        | "temporarily_closed"
        | "permanently_closed"
        | "suspended"
        | "rejected"
        | "archived"
      report_status: "open" | "under_review" | "resolved" | "dismissed"
      report_type:
        | "wrong_address"
        | "wrong_phone"
        | "incorrect_hours"
        | "incorrect_services"
        | "permanently_closed"
        | "temporarily_closed"
        | "duplicate_listing"
        | "misleading_information"
        | "inappropriate_content"
        | "other"
      service_delivery: "in_person" | "online" | "home_visit"
      source_type:
        | "manual"
        | "user_submission"
        | "clinic_representative"
        | "external_import"
        | "admin"
      submission_status:
        | "submitted"
        | "under_review"
        | "additional_information_required"
        | "approved"
        | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      age_group: [
        "infants",
        "toddlers",
        "preschool",
        "school_age",
        "teenagers",
        "adults",
      ],
      app_role: [
        "user",
        "clinic_representative",
        "moderator",
        "administrator",
        "super_administrator",
      ],
      candidate_status: ["new", "under_review", "promoted", "discarded"],
      change_request_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "partially_approved",
      ],
      claim_status: [
        "draft",
        "submitted",
        "under_review",
        "additional_information_required",
        "approved",
        "rejected",
        "revoked",
      ],
      duplicate_status: [
        "pending",
        "confirmed_duplicate",
        "not_duplicate",
        "merged",
      ],
      inquiry_status: ["open", "replied", "confirmed", "declined", "closed"],
      job_status: ["pending", "running", "completed", "failed", "dead"],
      listing_status: [
        "draft",
        "candidate",
        "pending_review",
        "published_unverified",
        "published_verified",
        "temporarily_closed",
        "permanently_closed",
        "suspended",
        "rejected",
        "archived",
      ],
      report_status: ["open", "under_review", "resolved", "dismissed"],
      report_type: [
        "wrong_address",
        "wrong_phone",
        "incorrect_hours",
        "incorrect_services",
        "permanently_closed",
        "temporarily_closed",
        "duplicate_listing",
        "misleading_information",
        "inappropriate_content",
        "other",
      ],
      service_delivery: ["in_person", "online", "home_visit"],
      source_type: [
        "manual",
        "user_submission",
        "clinic_representative",
        "external_import",
        "admin",
      ],
      submission_status: [
        "submitted",
        "under_review",
        "additional_information_required",
        "approved",
        "rejected",
      ],
    },
  },
} as const


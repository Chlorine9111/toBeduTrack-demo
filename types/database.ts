/**
 * Supabase Database types matching the SQL migration.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      teachers: {
        Row: {
          id: string;
          full_name: string | null;
          display_name: string | null;
          avatar_url: string | null;
          school_name: string | null;
          role_title: string | null;
          teaching_subjects: string[];
          onboarding_step: number;
          onboarding_completed_at: string | null;
          product_tour_state: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          school_name?: string | null;
          role_title?: string | null;
          teaching_subjects?: string[];
          onboarding_step?: number;
          onboarding_completed_at?: string | null;
          product_tour_state?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          school_name?: string | null;
          role_title?: string | null;
          teaching_subjects?: string[];
          onboarding_step?: number;
          onboarding_completed_at?: string | null;
          product_tour_state?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          email: string | null;
          default_role:
            | "subject_teacher"
            | "admin"
            | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          email?: string | null;
          default_role?:
            | "subject_teacher"
            | "admin"
            | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          email?: string | null;
          default_role?:
            | "subject_teacher"
            | "admin"
            | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_role_memberships: {
        Row: {
          id: string;
          user_id: string;
          role:
            | "subject_teacher"
            | "admin"
          status: "active" | "disabled";
          workspace_id: string | null;
          school_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role:
            | "subject_teacher"
            | "admin"
          status?: "active" | "disabled";
          workspace_id?: string | null;
          school_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?:
            | "subject_teacher"
            | "admin"
          status?: "active" | "disabled";
          workspace_id?: string | null;
          school_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          framework: string;
          name: string;
          code: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          framework: string;
          name: string;
          code: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          framework?: string;
          name?: string;
          code?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          course_id: string;
          unit_number: string;
          title: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          unit_number: string;
          title: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          unit_number?: string;
          title?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          id: string;
          unit_id: string;
          topic_number: string;
          title: string;
          learning_objectives: Json;
          essential_knowledge: Json;
          math_practices: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          topic_number: string;
          title: string;
          learning_objectives?: Json;
          essential_knowledge?: Json;
          math_practices?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          topic_number?: string;
          title?: string;
          learning_objectives?: Json;
          essential_knowledge?: Json;
          math_practices?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      wechat_templates: {
        Row: {
          id: string;
          name: string;
          thumbnail: string;
          categories: string[];
          color_family: string;
          has_hero_image: boolean;
          color_scheme: Json;
          block_styles: Json;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          thumbnail: string;
          categories?: string[];
          color_family: string;
          has_hero_image?: boolean;
          color_scheme: Json;
          block_styles: Json;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          thumbnail?: string;
          categories?: string[];
          color_family?: string;
          has_hero_image?: boolean;
          color_scheme?: Json;
          block_styles?: Json;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rubric_examples: {
        Row: {
          id: string;
          course_id: string;
          unit_id: string | null;
          rubric_json: Json;
          quality_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          unit_id?: string | null;
          rubric_json: Json;
          quality_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          unit_id?: string | null;
          rubric_json?: Json;
          quality_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_examples_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubric_examples_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_examples: {
        Row: {
          id: string;
          course_id: string;
          unit_id: string;
          topic_id: string;
          exercise_type: string;
          difficulty: number;
          exercise_json: Json;
          quality_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          unit_id: string;
          topic_id: string;
          exercise_type: string;
          difficulty: number;
          exercise_json: Json;
          quality_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          unit_id?: string;
          topic_id?: string;
          exercise_type?: string;
          difficulty?: number;
          exercise_json?: Json;
          quality_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_examples_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_examples_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_examples_topic_id_fkey";
            columns: ["topic_id"];
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      rubrics: {
        Row: {
          id: string;
          teacher_id: string;
          course_id: string;
          unit_id: string | null;
          title: string;
          status: string;
          teacher_prompt: string | null;
          is_ai_generated: boolean;
          teacher_modified: boolean;
          pdf_path: string | null;
          pdf_generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          course_id: string;
          unit_id?: string | null;
          title: string;
          status?: string;
          teacher_prompt?: string | null;
          is_ai_generated?: boolean;
          teacher_modified?: boolean;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          course_id?: string;
          unit_id?: string | null;
          title?: string;
          status?: string;
          teacher_prompt?: string | null;
          is_ai_generated?: boolean;
          teacher_modified?: boolean;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubrics_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubrics_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rubrics_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      rubric_dimensions: {
        Row: {
          id: string;
          rubric_id: string;
          name: string;
          description: string | null;
          weight: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          name: string;
          description?: string | null;
          weight: number;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rubric_id?: string;
          name?: string;
          description?: string | null;
          weight?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_dimensions_rubric_id_fkey";
            columns: ["rubric_id"];
            referencedRelation: "rubrics";
            referencedColumns: ["id"];
          },
        ];
      };
      rubric_levels: {
        Row: {
          id: string;
          dimension_id: string;
          level: string;
          score: number;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dimension_id: string;
          level: string;
          score: number;
          description: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dimension_id?: string;
          level?: string;
          score?: number;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rubric_levels_dimension_id_fkey";
            columns: ["dimension_id"];
            referencedRelation: "rubric_dimensions";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          id: string;
          teacher_id: string;
          course_id: string;
          unit_id: string | null;
          topic_id: string | null;
          rubric_id: string | null;
          import_batch_id: string | null;
          exercise_type: string;
          difficulty: number;
          content_json: Json;
          question_text: string;
          options: Json | null;
          correct_answer: string;
          solution_steps: string;
          common_mistakes: string[];
          verification_status: string;
          verification_attempts: number;
          is_ai_generated: boolean;
          teacher_modified: boolean;
          teacher_prompt: string | null;
          source_kind: string;
          source_document_id: string | null;
          source_upload_id: string | null;
          source_file_name: string | null;
          source_page_start: number | null;
          source_page_end: number | null;
          source_confidence: number | null;
          source_review_status: string;
          similarity_fingerprint: string | null;
          knowledge_cluster: string | null;
          knowledge_cluster_node_id: string | null;
          knowledge_subskill_key: string | null;
          knowledge_subskill_label: string | null;
          knowledge_subskill_node_id: string | null;
          knowledge_tags: string[];
          assessment_style: string | null;
          assessment_tags: string[];
          classification_confidence: number;
          classification_status: string;
          classification_reasons: string[];
          classification_updated_by_teacher: boolean;
          subskill_confidence: number | null;
          subskill_match_mode: string;
          subskill_reasons: string[];
          ap_ced_course: string | null;
          ap_ced_unit: number | null;
          ap_ced_topic_code: string | null;
          ap_ced_secondary_topics: string[];
          ap_ced_big_idea: string | null;
          ap_ced_science_practice: number | null;
          ap_ced_cognitive_task: string | null;
          ap_ced_transfer_distance: string | null;
          ap_ced_explanation: string | null;
          ap_ced_key_concepts: string[];
          ap_ced_negative_stem: boolean;
          ap_ced_stimulus_dependent: boolean;
          ap_ced_standalone_usable: boolean;
          ap_ced_choices_misconceptions: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          course_id: string;
          unit_id?: string | null;
          topic_id?: string | null;
          rubric_id?: string | null;
          import_batch_id?: string | null;
          exercise_type: string;
          difficulty: number;
          content_json?: Json;
          question_text: string;
          options?: Json | null;
          correct_answer: string;
          solution_steps: string;
          common_mistakes?: string[];
          verification_status?: string;
          verification_attempts?: number;
          is_ai_generated?: boolean;
          teacher_modified?: boolean;
          teacher_prompt?: string | null;
          source_kind?: string;
          source_document_id?: string | null;
          source_upload_id?: string | null;
          source_file_name?: string | null;
          source_page_start?: number | null;
          source_page_end?: number | null;
          source_confidence?: number | null;
          source_review_status?: string;
          similarity_fingerprint?: string | null;
          knowledge_cluster?: string | null;
          knowledge_cluster_node_id?: string | null;
          knowledge_subskill_key?: string | null;
          knowledge_subskill_label?: string | null;
          knowledge_subskill_node_id?: string | null;
          knowledge_tags?: string[];
          assessment_style?: string | null;
          assessment_tags?: string[];
          classification_confidence?: number;
          classification_status?: string;
          classification_reasons?: string[];
          classification_updated_by_teacher?: boolean;
          subskill_confidence?: number | null;
          subskill_match_mode?: string;
          subskill_reasons?: string[];
          ap_ced_course?: string | null;
          ap_ced_unit?: number | null;
          ap_ced_topic_code?: string | null;
          ap_ced_secondary_topics?: string[];
          ap_ced_big_idea?: string | null;
          ap_ced_science_practice?: number | null;
          ap_ced_cognitive_task?: string | null;
          ap_ced_transfer_distance?: string | null;
          ap_ced_explanation?: string | null;
          ap_ced_key_concepts?: string[];
          ap_ced_negative_stem?: boolean;
          ap_ced_stimulus_dependent?: boolean;
          ap_ced_standalone_usable?: boolean;
          ap_ced_choices_misconceptions?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          course_id?: string;
          unit_id?: string | null;
          topic_id?: string | null;
          rubric_id?: string | null;
          import_batch_id?: string | null;
          exercise_type?: string;
          difficulty?: number;
          content_json?: Json;
          question_text?: string;
          options?: Json | null;
          correct_answer?: string;
          solution_steps?: string;
          common_mistakes?: string[];
          verification_status?: string;
          verification_attempts?: number;
          is_ai_generated?: boolean;
          teacher_modified?: boolean;
          teacher_prompt?: string | null;
          source_kind?: string;
          source_document_id?: string | null;
          source_upload_id?: string | null;
          source_file_name?: string | null;
          source_page_start?: number | null;
          source_page_end?: number | null;
          source_confidence?: number | null;
          source_review_status?: string;
          similarity_fingerprint?: string | null;
          knowledge_cluster?: string | null;
          knowledge_cluster_node_id?: string | null;
          knowledge_subskill_key?: string | null;
          knowledge_subskill_label?: string | null;
          knowledge_subskill_node_id?: string | null;
          knowledge_tags?: string[];
          assessment_style?: string | null;
          assessment_tags?: string[];
          classification_confidence?: number;
          classification_status?: string;
          classification_reasons?: string[];
          classification_updated_by_teacher?: boolean;
          subskill_confidence?: number | null;
          subskill_match_mode?: string;
          subskill_reasons?: string[];
          ap_ced_course?: string | null;
          ap_ced_unit?: number | null;
          ap_ced_topic_code?: string | null;
          ap_ced_secondary_topics?: string[];
          ap_ced_big_idea?: string | null;
          ap_ced_science_practice?: number | null;
          ap_ced_cognitive_task?: string | null;
          ap_ced_transfer_distance?: string | null;
          ap_ced_explanation?: string | null;
          ap_ced_key_concepts?: string[];
          ap_ced_negative_stem?: boolean;
          ap_ced_stimulus_dependent?: boolean;
          ap_ced_standalone_usable?: boolean;
          ap_ced_choices_misconceptions?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_import_batch_id_fkey";
            columns: ["import_batch_id"];
            referencedRelation: "exercise_import_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_knowledge_cluster_node_id_fkey";
            columns: ["knowledge_cluster_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_knowledge_subskill_node_id_fkey";
            columns: ["knowledge_subskill_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_topic_id_fkey";
            columns: ["topic_id"];
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_rubric_id_fkey";
            columns: ["rubric_id"];
            referencedRelation: "rubrics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_source_document_id_fkey";
            columns: ["source_document_id"];
            referencedRelation: "knowledge_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_source_upload_id_fkey";
            columns: ["source_upload_id"];
            referencedRelation: "pdf_scan_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      question_taxonomy_nodes: {
        Row: {
          id: string;
          teacher_id: string;
          parent_node_id: string | null;
          merged_into_node_id: string | null;
          node_type: string;
          canonical_key: string;
          canonical_label: string;
          normalized_label: string;
          status: string;
          created_by: string;
          source_count: number;
          review_count: number;
          metadata: Json;
          last_suggested_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          parent_node_id?: string | null;
          merged_into_node_id?: string | null;
          node_type?: string;
          canonical_key: string;
          canonical_label: string;
          normalized_label: string;
          status?: string;
          created_by?: string;
          source_count?: number;
          review_count?: number;
          metadata?: Json;
          last_suggested_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          parent_node_id?: string | null;
          merged_into_node_id?: string | null;
          node_type?: string;
          canonical_key?: string;
          canonical_label?: string;
          normalized_label?: string;
          status?: string;
          created_by?: string;
          source_count?: number;
          review_count?: number;
          metadata?: Json;
          last_suggested_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_taxonomy_nodes_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_taxonomy_nodes_parent_node_id_fkey";
            columns: ["parent_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_taxonomy_nodes_merged_into_node_id_fkey";
            columns: ["merged_into_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
        ];
      };
      question_taxonomy_aliases: {
        Row: {
          id: string;
          teacher_id: string;
          node_id: string;
          alias_label: string;
          normalized_label: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          node_id: string;
          alias_label: string;
          normalized_label: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          node_id?: string;
          alias_label?: string;
          normalized_label?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_taxonomy_aliases_node_id_fkey";
            columns: ["node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_taxonomy_aliases_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_taxonomy_links: {
        Row: {
          exercise_id: string;
          teacher_id: string;
          cluster_node_id: string | null;
          subskill_node_id: string | null;
          match_mode: string;
          confidence: number | null;
          reasons: string[];
          raw_cluster_label: string | null;
          raw_subskill_label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          exercise_id: string;
          teacher_id: string;
          cluster_node_id?: string | null;
          subskill_node_id?: string | null;
          match_mode?: string;
          confidence?: number | null;
          reasons?: string[];
          raw_cluster_label?: string | null;
          raw_subskill_label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          exercise_id?: string;
          teacher_id?: string;
          cluster_node_id?: string | null;
          subskill_node_id?: string | null;
          match_mode?: string;
          confidence?: number | null;
          reasons?: string[];
          raw_cluster_label?: string | null;
          raw_subskill_label?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_taxonomy_links_exercise_id_fkey";
            columns: ["exercise_id"];
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_taxonomy_links_cluster_node_id_fkey";
            columns: ["cluster_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_taxonomy_links_subskill_node_id_fkey";
            columns: ["subskill_node_id"];
            referencedRelation: "question_taxonomy_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_taxonomy_links_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_import_batches: {
        Row: {
          id: string;
          teacher_id: string;
          source_kind: string;
          label: string;
          status: string;
          source_document_id: string | null;
          source_upload_id: string | null;
          total_detected: number;
          total_saved: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          source_kind?: string;
          label: string;
          status?: string;
          source_document_id?: string | null;
          source_upload_id?: string | null;
          total_detected?: number;
          total_saved?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          source_kind?: string;
          label?: string;
          status?: string;
          source_document_id?: string | null;
          source_upload_id?: string | null;
          total_detected?: number;
          total_saved?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_import_batches_source_document_id_fkey";
            columns: ["source_document_id"];
            referencedRelation: "knowledge_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_import_batches_source_upload_id_fkey";
            columns: ["source_upload_id"];
            referencedRelation: "pdf_scan_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_import_batches_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      worksheets: {
        Row: {
          id: string;
          teacher_id: string;
          course_id: string;
          unit_id: string | null;
          title: string;
          description: string | null;
          layout_config: Json;
          status: string;
          pdf_url: string | null;
          pdf_path: string | null;
          pdf_generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          course_id: string;
          unit_id?: string | null;
          title: string;
          description?: string | null;
          layout_config: Json;
          status?: string;
          pdf_url?: string | null;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          course_id?: string;
          unit_id?: string | null;
          title?: string;
          description?: string | null;
          layout_config?: Json;
          status?: string;
          pdf_url?: string | null;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worksheets_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worksheets_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worksheets_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      worksheet_exercises: {
        Row: {
          id: string;
          worksheet_id: string;
          exercise_id: string;
          sort_order: number;
          points: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          worksheet_id: string;
          exercise_id: string;
          sort_order: number;
          points?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          worksheet_id?: string;
          exercise_id?: string;
          sort_order?: number;
          points?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worksheet_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worksheet_exercises_worksheet_id_fkey";
            columns: ["worksheet_id"];
            referencedRelation: "worksheets";
            referencedColumns: ["id"];
          },
        ];
      };
      pdf_documents: {
        Row: {
          id: string;
          teacher_id: string;
          document_type: string;
          title: string;
          file_path: string;
          file_size: number;
          config: Json;
          worksheet_id: string | null;
          rubric_id: string | null;
          lesson_plan_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          document_type: string;
          title: string;
          file_path: string;
          file_size: number;
          config?: Json;
          worksheet_id?: string | null;
          rubric_id?: string | null;
          lesson_plan_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          document_type?: string;
          title?: string;
          file_path?: string;
          file_size?: number;
          config?: Json;
          worksheet_id?: string | null;
          rubric_id?: string | null;
          lesson_plan_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pdf_documents_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pdf_documents_worksheet_id_fkey";
            columns: ["worksheet_id"];
            referencedRelation: "worksheets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pdf_documents_rubric_id_fkey";
            columns: ["rubric_id"];
            referencedRelation: "rubrics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pdf_documents_lesson_plan_id_fkey";
            columns: ["lesson_plan_id"];
            referencedRelation: "lesson_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_lesson_preferences: {
        Row: {
          teacher_id: string;
          duration_minutes: number;
          student_level: string;
          language_pref: string;
          template_kind: string;
          quiz_density: string;
          explanation_depth: string;
          include_extension: boolean;
          show_ced_codes: boolean;
          include_teacher_notes: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          teacher_id: string;
          duration_minutes?: number;
          student_level?: string;
          language_pref?: string;
          template_kind?: string;
          quiz_density?: string;
          explanation_depth?: string;
          include_extension?: boolean;
          show_ced_codes?: boolean;
          include_teacher_notes?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          teacher_id?: string;
          duration_minutes?: number;
          student_level?: string;
          language_pref?: string;
          template_kind?: string;
          quiz_density?: string;
          explanation_depth?: string;
          include_extension?: boolean;
          show_ced_codes?: boolean;
          include_teacher_notes?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_lesson_preferences_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_plans: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          source_prompt: string;
          subject_label: string;
          course_id: string | null;
          unit_id: string | null;
          topic_ids: string[];
          learning_objective_codes: string[];
          essential_knowledge: Json;
          template_kind: string;
          duration_minutes: number;
          student_level: string;
          language_pref: string;
          quiz_density: string;
          explanation_depth: string;
          include_extension: boolean;
          show_ced_codes: boolean;
          include_teacher_notes: boolean;
          status: string;
          published_slug: string | null;
          published_at: string | null;
          pdf_path: string | null;
          pdf_generated_at: string | null;
          first_section_summary: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title: string;
          source_prompt: string;
          subject_label: string;
          course_id?: string | null;
          unit_id?: string | null;
          topic_ids?: string[];
          learning_objective_codes?: string[];
          essential_knowledge?: Json;
          template_kind?: string;
          duration_minutes?: number;
          student_level?: string;
          language_pref?: string;
          quiz_density?: string;
          explanation_depth?: string;
          include_extension?: boolean;
          show_ced_codes?: boolean;
          include_teacher_notes?: boolean;
          status?: string;
          published_slug?: string | null;
          published_at?: string | null;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          first_section_summary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          title?: string;
          source_prompt?: string;
          subject_label?: string;
          course_id?: string | null;
          unit_id?: string | null;
          topic_ids?: string[];
          learning_objective_codes?: string[];
          essential_knowledge?: Json;
          template_kind?: string;
          duration_minutes?: number;
          student_level?: string;
          language_pref?: string;
          quiz_density?: string;
          explanation_depth?: string;
          include_extension?: boolean;
          show_ced_codes?: boolean;
          include_teacher_notes?: boolean;
          status?: string;
          published_slug?: string | null;
          published_at?: string | null;
          pdf_path?: string | null;
          pdf_generated_at?: string | null;
          first_section_summary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_plans_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_plans_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_plans_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_plan_sections: {
        Row: {
          id: string;
          lesson_plan_id: string;
          title: string;
          summary: string | null;
          duration_minutes: number | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_plan_id: string;
          title: string;
          summary?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_plan_id?: string;
          title?: string;
          summary?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_plan_sections_lesson_plan_id_fkey";
            columns: ["lesson_plan_id"];
            referencedRelation: "lesson_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_plan_blocks: {
        Row: {
          id: string;
          lesson_plan_id: string;
          section_id: string;
          block_type: string;
          block_subtype: string | null;
          sort_order: number;
          content: Json;
          ced_codes: string[];
          teacher_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_plan_id: string;
          section_id: string;
          block_type: string;
          block_subtype?: string | null;
          sort_order?: number;
          content?: Json;
          ced_codes?: string[];
          teacher_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_plan_id?: string;
          section_id?: string;
          block_type?: string;
          block_subtype?: string | null;
          sort_order?: number;
          content?: Json;
          ced_codes?: string[];
          teacher_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_plan_blocks_lesson_plan_id_fkey";
            columns: ["lesson_plan_id"];
            referencedRelation: "lesson_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_plan_blocks_section_id_fkey";
            columns: ["section_id"];
            referencedRelation: "lesson_plan_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          id: string;
          teacher_id: string | null;
          display_name: string;
          is_anonymous: boolean;
          content: string;
          attachments: Json;
          category: string;
          source_path: string | null;
          source_label: string | null;
          locale: string | null;
          metadata: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id?: string | null;
          display_name: string;
          is_anonymous?: boolean;
          content: string;
          attachments?: Json;
          category?: string;
          source_path?: string | null;
          source_label?: string | null;
          locale?: string | null;
          metadata?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string | null;
          display_name?: string;
          is_anonymous?: boolean;
          content?: string;
          attachments?: Json;
          category?: string;
          source_path?: string | null;
          source_label?: string | null;
          locale?: string | null;
          metadata?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_admins: {
        Row: {
          teacher_id: string;
          granted_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          teacher_id: string;
          granted_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          teacher_id?: string;
          granted_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_admins_granted_by_fkey";
            columns: ["granted_by"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_admins_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_replies: {
        Row: {
          id: string;
          feedback_id: string;
          author_role: string;
          author_name: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          feedback_id: string;
          author_role: string;
          author_name: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          feedback_id?: string;
          author_role?: string;
          author_name?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_replies_feedback_id_fkey";
            columns: ["feedback_id"];
            referencedRelation: "feedback";
            referencedColumns: ["id"];
          },
        ];
      };
      pdf_scan_uploads: {
        Row: {
          id: string;
          teacher_id: string;
          file_name: string;
          file_url: string | null;
          storage_path: string | null;
          file_size: number;
          page_count: number | null;
          status: string;
          mathpix_id: string | null;
          question_count: number | null;
          scan_result: Json | null;
          error_message: string | null;
          processing_time_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          file_name: string;
          file_url?: string | null;
          storage_path?: string | null;
          file_size: number;
          page_count?: number | null;
          status?: string;
          mathpix_id?: string | null;
          question_count?: number | null;
          scan_result?: Json | null;
          error_message?: string | null;
          processing_time_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          file_name?: string;
          file_url?: string | null;
          storage_path?: string | null;
          file_size?: number;
          page_count?: number | null;
          status?: string;
          mathpix_id?: string | null;
          question_count?: number | null;
          scan_result?: Json | null;
          error_message?: string | null;
          processing_time_ms?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pdf_scan_uploads_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      grading_sessions: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          course_id: string | null;
          unit_id: string | null;
          topic_id: string | null;
          answer_key_source: string;
          answer_key: Json;
          rubric_id: string | null;
          status: string;
          student_count: number;
          question_count: number;
          stats: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title: string;
          course_id?: string | null;
          unit_id?: string | null;
          topic_id?: string | null;
          answer_key_source?: string;
          answer_key?: Json;
          rubric_id?: string | null;
          status?: string;
          student_count?: number;
          question_count?: number;
          stats?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          title?: string;
          course_id?: string | null;
          unit_id?: string | null;
          topic_id?: string | null;
          answer_key_source?: string;
          answer_key?: Json;
          rubric_id?: string | null;
          status?: string;
          student_count?: number;
          question_count?: number;
          stats?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      grading_submissions: {
        Row: {
          id: string;
          session_id: string;
          student_name: string;
          file_url: string | null;
          storage_path: string | null;
          page_count: number;
          ocr_result: Json | null;
          status: string;
          total_score: number | null;
          max_score: number | null;
          graded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_name?: string;
          file_url?: string | null;
          storage_path?: string | null;
          page_count?: number;
          ocr_result?: Json | null;
          status?: string;
          total_score?: number | null;
          max_score?: number | null;
          graded_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          student_name?: string;
          file_url?: string | null;
          storage_path?: string | null;
          page_count?: number;
          ocr_result?: Json | null;
          status?: string;
          total_score?: number | null;
          max_score?: number | null;
          graded_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grading_submissions_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "grading_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      grading_answers: {
        Row: {
          id: string;
          submission_id: string;
          question_number: number;
          student_answer: string;
          correct_answer: string;
          score: number;
          max_score: number;
          ai_feedback: string;
          confidence: number;
          question_type: string;
          scoring_breakdown: Json | null;
          needs_review: boolean;
          teacher_override_score: number | null;
          teacher_override_feedback: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          question_number: number;
          student_answer?: string;
          correct_answer?: string;
          score?: number;
          max_score?: number;
          ai_feedback?: string;
          confidence?: number;
          question_type?: string;
          scoring_breakdown?: Json | null;
          needs_review?: boolean;
          teacher_override_score?: number | null;
          teacher_override_feedback?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          question_number?: number;
          student_answer?: string;
          correct_answer?: string;
          score?: number;
          max_score?: number;
          ai_feedback?: string;
          confidence?: number;
          question_type?: string;
          scoring_breakdown?: Json | null;
          needs_review?: boolean;
          teacher_override_score?: number | null;
          teacher_override_feedback?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grading_answers_submission_id_fkey";
            columns: ["submission_id"];
            referencedRelation: "grading_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_documents: {
        Row: {
          chunk_count: number;
          id: string;
          teacher_id: string;
          filename: string;
          file_type: string;
          file_size: number;
          full_text_length: number;
          ocr_provider: string | null;
          subject: string | null;
          supermemory_ids: string[];
          unit: string | null;
          tags: string[];
          supermemory_id: string | null;
          storage_path: string | null;
          status: string;
          summary: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          chunk_count?: number;
          id?: string;
          teacher_id: string;
          filename: string;
          file_type: string;
          file_size?: number;
          full_text_length?: number;
          ocr_provider?: string | null;
          subject?: string | null;
          supermemory_ids?: string[];
          unit?: string | null;
          tags?: string[];
          supermemory_id?: string | null;
          storage_path?: string | null;
          status?: string;
          summary?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          chunk_count?: number;
          id?: string;
          teacher_id?: string;
          filename?: string;
          file_type?: string;
          file_size?: number;
          full_text_length?: number;
          ocr_provider?: string | null;
          subject?: string | null;
          supermemory_ids?: string[];
          unit?: string | null;
          tags?: string[];
          supermemory_id?: string | null;
          storage_path?: string | null;
          status?: string;
          summary?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_document_chunks: {
        Row: {
          id: string;
          document_id: string;
          teacher_id: string;
          chunk_index: number;
          page_start: number | null;
          page_end: number | null;
          title: string | null;
          content: string;
          content_preview: string | null;
          token_count: number;
          embedding: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          teacher_id: string;
          chunk_index: number;
          page_start?: number | null;
          page_end?: number | null;
          title?: string | null;
          content: string;
          content_preview?: string | null;
          token_count?: number;
          embedding?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          teacher_id?: string;
          chunk_index?: number;
          page_start?: number | null;
          page_end?: number | null;
          title?: string | null;
          content?: string;
          content_preview?: string | null;
          token_count?: number;
          embedding?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_document_chunks_document_id_fkey";
            columns: ["document_id"];
            referencedRelation: "knowledge_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_document_chunks_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_temp_question_pool_items: {
        Row: {
          id: string;
          pool_id: string;
          teacher_id: string;
          source_upload_id: string | null;
          source_file_name: string;
          sort_order: number;
          question_number: number;
          source_page_number: number | null;
          question_type: string;
          difficulty: string | null;
          confidence: number;
          question_text: string;
          options: Json;
          sub_questions: Json;
          linked_figures: Json;
          knowledge_point: string | null;
          source_type: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pool_id: string;
          teacher_id: string;
          source_upload_id?: string | null;
          source_file_name: string;
          sort_order?: number;
          question_number: number;
          source_page_number?: number | null;
          question_type: string;
          difficulty?: string | null;
          confidence?: number;
          question_text: string;
          options?: Json;
          sub_questions?: Json;
          linked_figures?: Json;
          knowledge_point?: string | null;
          source_type?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pool_id?: string;
          teacher_id?: string;
          source_upload_id?: string | null;
          source_file_name?: string;
          sort_order?: number;
          question_number?: number;
          source_page_number?: number | null;
          question_type?: string;
          difficulty?: string | null;
          confidence?: number;
          question_text?: string;
          options?: Json;
          sub_questions?: Json;
          linked_figures?: Json;
          knowledge_point?: string | null;
          source_type?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_temp_question_pool_items_pool_id_fkey";
            columns: ["pool_id"];
            referencedRelation: "agent_temp_question_pools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_temp_question_pool_items_source_upload_id_fkey";
            columns: ["source_upload_id"];
            referencedRelation: "pdf_scan_uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_temp_question_pool_items_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_temp_question_pools: {
        Row: {
          id: string;
          teacher_id: string;
          conversation_id: string;
          source_kind: string;
          label: string;
          status: string;
          source_file_names: string[];
          source_upload_ids: string[];
          question_count: number;
          ready_question_count: number;
          metadata: Json;
          expires_at: string | null;
          last_used_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          conversation_id: string;
          source_kind?: string;
          label: string;
          status?: string;
          source_file_names?: string[];
          source_upload_ids?: string[];
          question_count?: number;
          ready_question_count?: number;
          metadata?: Json;
          expires_at?: string | null;
          last_used_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          conversation_id?: string;
          source_kind?: string;
          label?: string;
          status?: string;
          source_file_names?: string[];
          source_upload_ids?: string[];
          question_count?: number;
          ready_question_count?: number;
          metadata?: Json;
          expires_at?: string | null;
          last_used_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_temp_question_pools_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "assistant_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_temp_question_pools_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_conversations: {
        Row: {
          id: string;
          teacher_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_messages: {
        Row: {
          id: string;
          conversation_id: string;
          teacher_id: string;
          role: string;
          content: string;
          sources: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          teacher_id: string;
          role: string;
          content: string;
          sources?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          teacher_id?: string;
          role?: string;
          content?: string;
          sources?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "assistant_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_messages_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      content_library_items: {
        Row: {
          id: string;
          teacher_id: string;
          content_type: string;
          renderer_type: string;
          origin_key: string;
          origin_entity_type: string;
          origin_entity_id: string | null;
          source_conversation_id: string | null;
          source_message_id: string | null;
          source_item_id: string | null;
          title: string;
          custom_title: string | null;
          note: string | null;
          summary_text: string | null;
          search_text: string;
          course_id: string | null;
          unit_id: string | null;
          course_label: string | null;
          unit_label: string | null;
          document_id: string | null;
          snapshot: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          content_type: string;
          renderer_type: string;
          origin_key: string;
          origin_entity_type: string;
          origin_entity_id?: string | null;
          source_conversation_id?: string | null;
          source_message_id?: string | null;
          source_item_id?: string | null;
          title: string;
          custom_title?: string | null;
          note?: string | null;
          summary_text?: string | null;
          search_text?: string;
          course_id?: string | null;
          unit_id?: string | null;
          course_label?: string | null;
          unit_label?: string | null;
          document_id?: string | null;
          snapshot?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          content_type?: string;
          renderer_type?: string;
          origin_key?: string;
          origin_entity_type?: string;
          origin_entity_id?: string | null;
          source_conversation_id?: string | null;
          source_message_id?: string | null;
          source_item_id?: string | null;
          title?: string;
          custom_title?: string | null;
          note?: string | null;
          summary_text?: string | null;
          search_text?: string;
          course_id?: string | null;
          unit_id?: string | null;
          course_label?: string | null;
          unit_label?: string | null;
          document_id?: string | null;
          snapshot?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_library_items_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_source_conversation_id_fkey";
            columns: ["source_conversation_id"];
            referencedRelation: "assistant_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_source_message_id_fkey";
            columns: ["source_message_id"];
            referencedRelation: "assistant_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_source_item_id_fkey";
            columns: ["source_item_id"];
            referencedRelation: "content_library_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_document_id_fkey";
            columns: ["document_id"];
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          html_content: string;
          properties: Json;
          document_kind: string;
          editor_kind: string;
          document_model: Json | null;
          metadata: Json;
          source_type: string;
          source_id: string | null;
          starred: boolean;
          deleted_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title?: string;
          html_content?: string;
          properties?: Json;
          document_kind?: string;
          editor_kind?: string;
          document_model?: Json | null;
          metadata?: Json;
          source_type?: string;
          source_id?: string | null;
          starred?: boolean;
          deleted_at?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          title?: string;
          html_content?: string;
          properties?: Json;
          document_kind?: string;
          editor_kind?: string;
          document_model?: Json | null;
          metadata?: Json;
          source_type?: string;
          source_id?: string | null;
          starred?: boolean;
          deleted_at?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          id: string;
          document_id: string;
          teacher_id: string;
          title: string;
          html_content: string;
          properties: Json;
          document_kind: string;
          editor_kind: string;
          document_model: Json | null;
          metadata: Json;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          teacher_id: string;
          title?: string;
          html_content?: string;
          properties?: Json;
          document_kind?: string;
          editor_kind?: string;
          document_model?: Json | null;
          metadata?: Json;
          version: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          teacher_id?: string;
          title?: string;
          html_content?: string;
          properties?: Json;
          document_kind?: string;
          editor_kind?: string;
          document_model?: Json | null;
          metadata?: Json;
          version?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      content_folders: {
        Row: {
          id: string;
          teacher_id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          sort_order: number;
          is_system: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          is_system?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          is_system?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_folders_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_folders_parent_id_fkey";
            columns: ["parent_id"];
            referencedRelation: "content_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      content_assets: {
        Row: {
          id: string;
          teacher_id: string;
          folder_id: string | null;
          asset_source: string;
          file_name: string | null;
          file_type: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          storage_path: string | null;
          storage_bucket: string | null;
          ref_entity_type: string | null;
          ref_entity_id: string | null;
          content_library_item_id: string | null;
          title: string;
          raw_text: string | null;
          summary_text: string | null;
          tags: string[];
          search_text: string;
          course_id: string | null;
          unit_id: string | null;
          course_label: string | null;
          unit_label: string | null;
          processing_status: string;
          processing_error: string | null;
          chunk_count: number;
          page_count: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          folder_id?: string | null;
          asset_source: string;
          file_name?: string | null;
          file_type?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          storage_path?: string | null;
          storage_bucket?: string;
          ref_entity_type?: string | null;
          ref_entity_id?: string | null;
          content_library_item_id?: string | null;
          title: string;
          raw_text?: string | null;
          summary_text?: string | null;
          tags?: string[];
          search_text?: string;
          course_id?: string | null;
          unit_id?: string | null;
          course_label?: string | null;
          unit_label?: string | null;
          processing_status?: string;
          processing_error?: string | null;
          chunk_count?: number;
          page_count?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          folder_id?: string | null;
          asset_source?: string;
          file_name?: string | null;
          file_type?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          storage_path?: string | null;
          storage_bucket?: string;
          ref_entity_type?: string | null;
          ref_entity_id?: string | null;
          content_library_item_id?: string | null;
          title?: string;
          raw_text?: string | null;
          summary_text?: string | null;
          tags?: string[];
          search_text?: string;
          course_id?: string | null;
          unit_id?: string | null;
          course_label?: string | null;
          unit_label?: string | null;
          processing_status?: string;
          processing_error?: string | null;
          chunk_count?: number;
          page_count?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_assets_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_assets_folder_id_fkey";
            columns: ["folder_id"];
            referencedRelation: "content_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      content_asset_chunks: {
        Row: {
          id: string;
          asset_id: string;
          teacher_id: string;
          chunk_index: number;
          page_start: number | null;
          page_end: number | null;
          title: string | null;
          content: string;
          content_preview: string | null;
          token_count: number;
          embedding: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          asset_id: string;
          teacher_id: string;
          chunk_index: number;
          page_start?: number | null;
          page_end?: number | null;
          title?: string | null;
          content: string;
          content_preview?: string | null;
          token_count?: number;
          embedding?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string;
          teacher_id?: string;
          chunk_index?: number;
          page_start?: number | null;
          page_end?: number | null;
          title?: string | null;
          content?: string;
          content_preview?: string | null;
          token_count?: number;
          embedding?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_asset_chunks_asset_id_fkey";
            columns: ["asset_id"];
            referencedRelation: "content_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_asset_chunks_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      background_jobs: {
        Row: {
          id: string;
          teacher_id: string | null;
          job_type: string;
          job_key: string;
          status: string;
          priority: number;
          attempts: number;
          max_attempts: number;
          payload: Json;
          result: Json | null;
          error_message: string | null;
          available_at: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id?: string | null;
          job_type: string;
          job_key: string;
          status?: string;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          available_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string | null;
          job_type?: string;
          job_key?: string;
          status?: string;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          available_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "background_jobs_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      flashcard_sets: {
        Row: {
          id: string;
          asset_id: string | null;
          teacher_id: string;
          title: string;
          card_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          asset_id?: string | null;
          teacher_id: string;
          title: string;
          card_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          asset_id?: string | null;
          teacher_id?: string;
          title?: string;
          card_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flashcard_sets_asset_id_fkey";
            columns: ["asset_id"];
            referencedRelation: "content_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcard_sets_teacher_id_fkey";
            columns: ["teacher_id"];
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      flashcards: {
        Row: {
          id: string;
          set_id: string;
          front_text: string;
          front_image_url: string | null;
          back_text: string;
          back_image_url: string | null;
          sort_order: number;
          difficulty: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          front_text: string;
          front_image_url?: string | null;
          back_text: string;
          back_image_url?: string | null;
          sort_order?: number;
          difficulty?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          front_text?: string;
          front_image_url?: string | null;
          back_text?: string;
          back_image_url?: string | null;
          sort_order?: number;
          difficulty?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flashcards_set_id_fkey";
            columns: ["set_id"];
            referencedRelation: "flashcard_sets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      autosave_document: {
        Args: {
          p_document_id: string;
          p_teacher_id: string;
          p_title: string;
          p_html_content: string;
          p_properties: Json;
          p_expected_version: number;
        };
        Returns: {
          saved_at: string;
          version: number;
          changed: boolean;
        }[];
      };
      restore_document_version: {
        Args: {
          p_document_id: string;
          p_version_id: string;
          p_teacher_id: string;
          p_expected_version?: number | null;
        };
        Returns: {
          saved_at: string;
          version: number;
          changed: boolean;
        }[];
      };
      get_quota_summary: {
        Args: {
          p_teacher_id: string;
        };
        Returns: {
          plan: string;
          status: string;
          quota_total: number;
          quota_used: number;
          quota_remaining: number;
          quota_soft_remaining: number;
          grace_buffer: number;
          period_days: number;
          period_start: string;
          period_end: string;
          usage_ratio: number;
        }[];
      };
      check_quota_admission: {
        Args: {
          p_teacher_id: string;
          p_units: number;
        };
        Returns: {
          allowed: boolean;
          reason: string | null;
          requested_units: number;
          plan: string;
          status: string;
          quota_total: number;
          quota_used: number;
          quota_remaining: number;
          quota_soft_remaining: number;
          grace_buffer: number;
          period_days: number;
          period_start: string;
          period_end: string;
          usage_ratio: number;
        }[];
      };
      finalize_quota_spend: {
        Args: {
          p_teacher_id: string;
          p_action: string;
          p_quota_class: string;
          p_units: number;
          p_idempotency_key: string;
          p_metadata?: Json;
        };
        Returns: {
          charged: boolean;
          already_recorded: boolean;
          reason: string | null;
          transaction_id: string | null;
          plan: string;
          status: string;
          quota_total: number;
          quota_used: number;
          quota_remaining: number;
          quota_soft_remaining: number;
          grace_buffer: number;
          period_days: number;
          period_start: string;
          period_end: string;
          usage_ratio: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

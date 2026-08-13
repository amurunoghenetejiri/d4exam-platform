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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          school_id: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          school_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          school_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          school_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          school_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          school_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          course_id: string
          created_at: string
          department_id: string
          id: string
          level_id: string
          school_id: string
          status: string
        }
        Insert: {
          course_id: string
          created_at?: string
          department_id: string
          id?: string
          level_id: string
          school_id: string
          status?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          department_id?: string
          id?: string
          level_id?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          credit_units: number
          department_id: string | null
          description: string | null
          id: string
          level_id: string | null
          name: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credit_units?: number
          department_id?: string | null
          description?: string | null
          id?: string
          level_id?: string | null
          name: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credit_units?: number
          department_id?: string | null
          description?: string | null
          id?: string
          level_id?: string | null
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          faculty_id: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          answers: Json
          created_at: string
          ends_at: string | null
          exam_id: string
          fullscreen_exit_count: number
          id: string
          metadata: Json
          objective_score: number | null
          question_order: Json
          school_id: string
          security_review_status: string
          started_at: string | null
          status: string
          student_id: string
          subjective_score: number | null
          submitted_at: string | null
          tab_switch_count: number
          terminated_at: string | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          ends_at?: string | null
          exam_id: string
          fullscreen_exit_count?: number
          id?: string
          metadata?: Json
          objective_score?: number | null
          question_order?: Json
          school_id: string
          security_review_status?: string
          started_at?: string | null
          status?: string
          student_id: string
          subjective_score?: number | null
          submitted_at?: string | null
          tab_switch_count?: number
          terminated_at?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          ends_at?: string | null
          exam_id?: string
          fullscreen_exit_count?: number
          id?: string
          metadata?: Json
          objective_score?: number | null
          question_order?: Json
          school_id?: string
          security_review_status?: string
          started_at?: string | null
          status?: string
          student_id?: string
          subjective_score?: number | null
          submitted_at?: string | null
          tab_switch_count?: number
          terminated_at?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          marks: number
          question_id: string
          question_order: number
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          marks?: number
          question_id: string
          question_order?: number
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          marks?: number
          question_id?: string
          question_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_settings: {
        Row: {
          block_copy_paste: boolean
          created_at: string
          exam_id: string
          fullscreen: boolean
          id: string
          instructions: string | null
          max_fullscreen_exits: number
          max_tab_switches: number
          randomize_options: boolean
          randomize_questions: boolean
          require_camera: boolean
          require_microphone: boolean
          result_visibility: string
          tab_monitoring: boolean
          threshold_action: string
          total_marks: number
          updated_at: string
          warning_threshold: number
        }
        Insert: {
          block_copy_paste?: boolean
          created_at?: string
          exam_id: string
          fullscreen?: boolean
          id?: string
          instructions?: string | null
          max_fullscreen_exits?: number
          max_tab_switches?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          require_camera?: boolean
          require_microphone?: boolean
          result_visibility?: string
          tab_monitoring?: boolean
          threshold_action?: string
          total_marks?: number
          updated_at?: string
          warning_threshold?: number
        }
        Update: {
          block_copy_paste?: boolean
          created_at?: string
          exam_id?: string
          fullscreen?: boolean
          id?: string
          instructions?: string | null
          max_fullscreen_exits?: number
          max_tab_switches?: number
          randomize_options?: boolean
          randomize_questions?: boolean
          require_camera?: boolean
          require_microphone?: boolean
          result_visibility?: string
          tab_monitoring?: boolean
          threshold_action?: string
          total_marks?: number
          updated_at?: string
          warning_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_settings_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: true
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
        ]
      }
      examination_officers: {
        Row: {
          created_at: string
          id: string
          officer_id: string
          profile_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          officer_id: string
          profile_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          officer_id?: string
          profile_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "examination_officers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examination_officers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      examinations: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          scheduled_end: string | null
          scheduled_start: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "examinations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examinations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      faculties: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculties_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_events: {
        Row: {
          attempt_id: string | null
          created_at: string
          description: string | null
          event_type: string
          exam_id: string
          id: string
          metadata: Json
          school_id: string
          severity: string
          student_id: string | null
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          exam_id: string
          id?: string
          metadata?: Json
          school_id: string
          severity?: string
          student_id?: string | null
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          exam_id?: string
          id?: string
          metadata?: Json
          school_id?: string
          severity?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrity_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrity_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          recipient_user_id: string
          school_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          recipient_user_id: string
          school_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_user_id?: string
          school_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          middle_name: string | null
          phone: string | null
          profile_photo_url: string | null
          school_id: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          middle_name?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          school_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_answer: string | null
          course_id: string | null
          created_at: string
          created_by: string | null
          difficulty: string
          explanation: string | null
          id: string
          marks: number
          question_text: string
          question_type: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          correct_answer?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          explanation?: string | null
          id?: string
          marks?: number
          question_text: string
          question_type?: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          correct_answer?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          explanation?: string | null
          id?: string
          marks?: number
          question_text?: string
          question_type?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          attempt_id: string | null
          correct_count: number | null
          created_at: string
          exam_id: string
          grade: string | null
          id: string
          objective_score: number | null
          pass_fail: string | null
          percentage: number | null
          released_at: string | null
          released_by: string | null
          school_id: string
          security_review_note: string | null
          security_review_status: string
          status: string
          student_id: string
          subjective_score: number | null
          total_score: number | null
          unanswered_count: number | null
          updated_at: string
          wrong_count: number | null
        }
        Insert: {
          attempt_id?: string | null
          correct_count?: number | null
          created_at?: string
          exam_id: string
          grade?: string | null
          id?: string
          objective_score?: number | null
          pass_fail?: string | null
          percentage?: number | null
          released_at?: string | null
          released_by?: string | null
          school_id: string
          security_review_note?: string | null
          security_review_status?: string
          status?: string
          student_id: string
          subjective_score?: number | null
          total_score?: number | null
          unanswered_count?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Update: {
          attempt_id?: string | null
          correct_count?: number | null
          created_at?: string
          exam_id?: string
          grade?: string | null
          id?: string
          objective_score?: number | null
          pass_fail?: string | null
          percentage?: number | null
          released_at?: string | null
          released_by?: string | null
          school_id?: string
          security_review_note?: string | null
          security_review_status?: string
          status?: string
          student_id?: string
          subjective_score?: number | null
          total_score?: number | null
          unanswered_count?: number | null
          updated_at?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_applications: {
        Row: {
          address: string | null
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          city: string | null
          country: string | null
          created_at: string
          documents: Json
          id: string
          official_email: string
          official_phone: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_name: string
          school_type: string | null
          state: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          applicant_email: string
          applicant_name: string
          applicant_phone?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          documents?: Json
          id?: string
          official_email: string
          official_phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_name: string
          school_type?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          documents?: Json
          id?: string
          official_email?: string
          official_phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_name?: string
          school_type?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          official_email: string | null
          official_phone: string | null
          school_code: string
          school_type: string | null
          state: string | null
          status: string
          subscription_plan: string
          subscription_status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          official_email?: string | null
          official_phone?: string | null
          school_code: string
          school_type?: string | null
          state?: string | null
          status?: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          official_email?: string | null
          official_phone?: string | null
          school_code?: string
          school_type?: string | null
          state?: string | null
          status?: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      semesters: {
        Row: {
          academic_session_id: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          school_id: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          school_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          school_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_courses: {
        Row: {
          academic_session_id: string | null
          course_id: string
          created_at: string
          id: string
          school_id: string
          semester_id: string | null
          status: string
          student_id: string
        }
        Insert: {
          academic_session_id?: string | null
          course_id: string
          created_at?: string
          id?: string
          school_id: string
          semester_id?: string | null
          status?: string
          student_id: string
        }
        Update: {
          academic_session_id?: string | null
          course_id?: string
          created_at?: string
          id?: string
          school_id?: string
          semester_id?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_courses_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_session_id: string | null
          admission_number: string | null
          created_at: string
          department_id: string | null
          faculty_id: string | null
          full_name: string | null
          id: string
          level_id: string | null
          matric_number: string | null
          profile_id: string | null
          profile_photo_url: string | null
          school_id: string
          status: Database["public"]["Enums"]["account_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          admission_number?: string | null
          created_at?: string
          department_id?: string | null
          faculty_id?: string | null
          full_name?: string | null
          id?: string
          level_id?: string | null
          matric_number?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["account_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          admission_number?: string | null
          created_at?: string
          department_id?: string | null
          faculty_id?: string | null
          full_name?: string | null
          id?: string
          level_id?: string | null
          matric_number?: string | null
          profile_id?: string | null
          profile_photo_url?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["account_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_courses: {
        Row: {
          academic_session_id: string | null
          course_id: string
          created_at: string
          id: string
          school_id: string
          semester_id: string | null
          teacher_id: string
        }
        Insert: {
          academic_session_id?: string | null
          course_id: string
          created_at?: string
          id?: string
          school_id: string
          semester_id?: string | null
          teacher_id: string
        }
        Update: {
          academic_session_id?: string | null
          course_id?: string
          created_at?: string
          id?: string
          school_id?: string
          semester_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_courses_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_courses_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          department_id: string | null
          employment_status: string
          faculty_id: string | null
          id: string
          profile_id: string | null
          school_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          employment_status?: string
          faculty_id?: string | null
          id?: string
          profile_id?: string | null
          school_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          employment_status?: string
          faculty_id?: string | null
          id?: string
          profile_id?: string | null
          school_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_school: { Args: { _school: string }; Returns: boolean }
      current_account_active: { Args: never; Returns: boolean }
      current_school_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_teacher_id: { Args: never; Returns: string }
      generate_school_code: { Args: { _name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_school: { Args: { _school: string }; Returns: boolean }
      is_school_teacher: { Args: { _school: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      resolve_login_identity: {
        Args: { _identifier: string; _school_code: string }
        Returns: {
          account_status: string
          email: string
          kind: string
          school_active: boolean
        }[]
      }
    }
    Enums: {
      account_status:
        | "pending"
        | "invited"
        | "active"
        | "suspended"
        | "deactivated"
        | "locked"
      app_role:
        | "student"
        | "teacher"
        | "school_admin"
        | "examination_officer"
        | "super_admin"
      application_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
        | "more_information_required"
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
      account_status: [
        "pending",
        "invited",
        "active",
        "suspended",
        "deactivated",
        "locked",
      ],
      app_role: [
        "student",
        "teacher",
        "school_admin",
        "examination_officer",
        "super_admin",
      ],
      application_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "more_information_required",
      ],
    },
  },
} as const

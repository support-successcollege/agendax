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
      article_comments: {
        Row: {
          approved_at: string | null
          article_id: string
          author_email: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          is_approved: boolean
        }
        Insert: {
          approved_at?: string | null
          article_id: string
          author_email?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean
        }
        Update: {
          approved_at?: string | null
          article_id?: string
          author_email?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_reactions: {
        Row: {
          article_id: string
          created_at: string
          id: string
          reaction_type: string
          session_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          reaction_type: string
          session_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          reaction_type?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_reactions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          platform: string
          enabled: boolean
          auto_publish: boolean
          credentials: Json
          updated_at: string
        }
        Insert: {
          platform: string
          enabled?: boolean
          auto_publish?: boolean
          credentials?: Json
          updated_at?: string
        }
        Update: {
          platform?: string
          enabled?: boolean
          auto_publish?: boolean
          credentials?: Json
          updated_at?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          id: string
          article_id: string
          platform: string
          status: string
          external_id: string | null
          post_text: string | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          article_id: string
          platform: string
          status?: string
          external_id?: string | null
          post_text?: string | null
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          article_id?: string
          platform?: string
          status?: string
          external_id?: string | null
          post_text?: string | null
          error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      newsletter_sends: {
        Row: {
          id: string
          subject: string
          category: string | null
          article_ids: string[]
          recipients_count: number
          test: boolean
          created_at: string
        }
        Insert: {
          id?: string
          subject: string
          category?: string | null
          article_ids?: string[]
          recipients_count?: number
          test?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          subject?: string
          category?: string | null
          article_ids?: string[]
          recipients_count?: number
          test?: boolean
          created_at?: string
        }
        Relationships: []
      }
      ai_advice: {
        Row: {
          id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author: string
          category: string
          category_slug: string
          content: string
          created_at: string
          date: string
          excerpt: string
          id: string
          image_url: string
          is_breaking: boolean | null
          is_draft: boolean
          is_featured: boolean | null
          published_at: string | null
          scheduled_at: string | null
          source_name: string | null
          source_published_at: string | null
          source_url: string | null
          slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          category: string
          category_slug: string
          content: string
          created_at?: string
          date?: string
          excerpt: string
          id?: string
          image_url: string
          is_breaking?: boolean | null
          is_draft?: boolean
          is_featured?: boolean | null
          published_at?: string | null
          scheduled_at?: string | null
          source_name?: string | null
          source_published_at?: string | null
          source_url?: string | null
          slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          category_slug?: string
          content?: string
          created_at?: string
          date?: string
          excerpt?: string
          id?: string
          image_url?: string
          is_breaking?: boolean | null
          is_draft?: boolean
          is_featured?: boolean | null
          published_at?: string | null
          scheduled_at?: string | null
          source_name?: string | null
          source_published_at?: string | null
          source_url?: string | null
          slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_coupons: {
        Row: {
          code: string
          course_id: string
          created_at: string
          discount_percent: number
          expires_at: string | null
          grants_free_access: boolean
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          course_id: string
          created_at?: string
          discount_percent?: number
          expires_at?: string | null
          grants_free_access?: boolean
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          course_id?: string
          created_at?: string
          discount_percent?: number
          expires_at?: string | null
          grants_free_access?: boolean
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_coupons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          coupon_code: string | null
          course_id: string
          discount_percent: number | null
          email: string
          enrolled_at: string
          full_name: string
          id: string
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_currency: string | null
          payment_status: string
          paypal_order_id: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          coupon_code?: string | null
          course_id: string
          discount_percent?: number | null
          email: string
          enrolled_at?: string
          full_name: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_currency?: string | null
          payment_status?: string
          paypal_order_id?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          coupon_code?: string | null
          course_id?: string
          discount_percent?: number | null
          email?: string
          enrolled_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_currency?: string | null
          payment_status?: string
          paypal_order_id?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_minutes: number | null
          id: string
          is_free: boolean
          module_id: string
          presentation_url: string | null
          title: string
          video_file_url: string | null
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean
          module_id: string
          presentation_url?: string | null
          title: string
          video_file_url?: string | null
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean
          module_id?: string
          presentation_url?: string | null
          title?: string
          video_file_url?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          cover_image_url: string | null
          created_at: string
          currency: string
          description: string | null
          display_order: number | null
          duration_hours: number | null
          id: string
          instructor_bio: string | null
          instructor_name: string | null
          is_published: boolean
          level: string | null
          original_price: number | null
          price: number
          short_description: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number | null
          duration_hours?: number | null
          id?: string
          instructor_bio?: string | null
          instructor_name?: string | null
          is_published?: boolean
          level?: string | null
          original_price?: number | null
          price?: number
          short_description?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number | null
          duration_hours?: number | null
          id?: string
          instructor_bio?: string | null
          instructor_name?: string | null
          is_published?: boolean
          level?: string | null
          original_price?: number | null
          price?: number
          short_description?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_registrations: {
        Row: {
          attendance_status: string
          email: string
          event_id: string
          full_name: string
          id: string
          phone: string | null
          registered_at: string
          user_id: string | null
        }
        Insert: {
          attendance_status?: string
          email: string
          event_id: string
          full_name: string
          id?: string
          phone?: string | null
          registered_at?: string
          user_id?: string | null
        }
        Update: {
          attendance_status?: string
          email?: string
          event_id?: string
          full_name?: string
          id?: string
          phone?: string | null
          registered_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          event_date: string
          event_time: string | null
          id: string
          is_published: boolean
          location: string | null
          location_type: string
          max_attendees: number | null
          price: number
          registration_deadline: string | null
          slug: string
          speaker_bio: string | null
          speaker_name: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          event_date: string
          event_time?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          location_type?: string
          max_attendees?: number | null
          price?: number
          registration_deadline?: string | null
          slug: string
          speaker_bio?: string | null
          speaker_name?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          event_date?: string
          event_time?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          location_type?: string
          max_attendees?: number | null
          price?: number
          registration_deadline?: string | null
          slug?: string
          speaker_bio?: string | null
          speaker_name?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingest_config: {
        Row: {
          daily_target: number
          id: boolean
          lookback_hours: number
          queue_buffer: number
          updated_at: string
        }
        Insert: {
          daily_target?: number
          id?: boolean
          lookback_hours?: number
          queue_buffer?: number
          updated_at?: string
        }
        Update: {
          daily_target?: number
          id?: boolean
          lookback_hours?: number
          queue_buffer?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingest_items: {
        Row: {
          angle: string | null
          article_id: string | null
          attempts: number
          bucket: string | null
          category_hint: string | null
          created_at: string
          error: string | null
          id: string
          priority: number
          published_at: string | null
          source_name: string
          source_published_at: string | null
          source_summary: string | null
          source_title: string
          status: string
          updated_at: string
          url: string
          url_key: string
        }
        Insert: {
          angle?: string | null
          article_id?: string | null
          attempts?: number
          bucket?: string | null
          category_hint?: string | null
          created_at?: string
          error?: string | null
          id?: string
          priority?: number
          published_at?: string | null
          source_name: string
          source_published_at?: string | null
          source_summary?: string | null
          source_title: string
          status?: string
          updated_at?: string
          url: string
          url_key: string
        }
        Update: {
          angle?: string | null
          article_id?: string | null
          attempts?: number
          bucket?: string | null
          category_hint?: string | null
          created_at?: string
          error?: string | null
          id?: string
          priority?: number
          published_at?: string | null
          source_name?: string
          source_published_at?: string | null
          source_summary?: string | null
          source_title?: string
          status?: string
          updated_at?: string
          url?: string
          url_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          articles_created: number
          created_at: string
          duration_ms: number | null
          id: string
          items_new: number
          items_queued: number
          items_seen: number
          kind: string
          notes: Json
          sources_failed: number
          sources_ok: number
          trigger: string
        }
        Insert: {
          articles_created?: number
          created_at?: string
          duration_ms?: number | null
          id?: string
          items_new?: number
          items_queued?: number
          items_seen?: number
          kind: string
          notes?: Json
          sources_failed?: number
          sources_ok?: number
          trigger?: string
        }
        Update: {
          articles_created?: number
          created_at?: string
          duration_ms?: number | null
          id?: string
          items_new?: number
          items_queued?: number
          items_seen?: number
          kind?: string
          notes?: Json
          sources_failed?: number
          sources_ok?: number
          trigger?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          cover_letter: string | null
          created_at: string
          cv_url: string | null
          email: string
          full_name: string
          id: string
          job_id: string
          phone: string | null
        }
        Insert: {
          cover_letter?: string | null
          created_at?: string
          cv_url?: string | null
          email: string
          full_name: string
          id?: string
          job_id: string
          phone?: string | null
        }
        Update: {
          cover_letter?: string | null
          created_at?: string
          cv_url?: string | null
          email?: string
          full_name?: string
          id?: string
          job_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_type: string
          application_url: string | null
          company_name: string
          created_at: string
          description: string
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean
          job_type: string
          location: string
          salary_range: string | null
          title: string
          updated_at: string
        }
        Insert: {
          application_type?: string
          application_url?: string | null
          company_name: string
          created_at?: string
          description: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          job_type: string
          location: string
          salary_range?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          application_type?: string
          application_url?: string | null
          company_name?: string
          created_at?: string
          description?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          job_type?: string
          location?: string
          salary_range?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lesson_resources: {
        Row: {
          created_at: string
          display_order: number | null
          file_type: string | null
          file_url: string
          id: string
          lesson_id: string
          title: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lesson_id: string
          title: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lesson_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_views: {
        Row: {
          completed: boolean
          id: string
          lesson_id: string
          user_id: string | null
          viewed_at: string
        }
        Insert: {
          completed?: boolean
          id?: string
          lesson_id: string
          user_id?: string | null
          viewed_at?: string
        }
        Update: {
          completed?: boolean
          id?: string
          lesson_id?: string
          user_id?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_views_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          bucket: string
          created_at: string
          feed_url: string
          homepage: string | null
          id: string
          is_active: boolean
          last_fetched_at: string | null
          last_item_count: number
          last_status: string | null
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          bucket?: string
          created_at?: string
          feed_url: string
          homepage?: string | null
          id?: string
          is_active?: boolean
          last_fetched_at?: string | null
          last_item_count?: number
          last_status?: string | null
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          feed_url?: string
          homepage?: string | null
          id?: string
          is_active?: boolean
          last_fetched_at?: string | null
          last_item_count?: number
          last_status?: string | null
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          interest_category: string | null
          is_active: boolean
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          interest_category?: string | null
          is_active?: boolean
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          interest_category?: string | null
          is_active?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          article_id: string | null
          id: string
          ip_hash: string | null
          path: string | null
          referrer: string | null
          user_agent: string | null
          viewed_at: string
          visitor_id: string | null
        }
        Insert: {
          article_id?: string | null
          id?: string
          ip_hash?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
          visitor_id?: string | null
        }
        Update: {
          article_id?: string | null
          id?: string
          ip_hash?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
          viewed_at?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inquiries: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          phone: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          phone?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          phone?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          enable_inquiry: boolean
          external_checkout_url: string | null
          id: string
          image_url: string | null
          is_active: boolean
          price: number | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          enable_inquiry?: boolean
          external_checkout_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          price?: number | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          enable_inquiry?: boolean
          external_checkout_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          price?: number | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sidebar_widgets: {
        Row: {
          action_type: string
          button_text: string
          categories: string[] | null
          created_at: string
          description: string | null
          display_order: number | null
          form_fields: Json | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string
          title: string
          updated_at: string
          widget_type: string
        }
        Insert: {
          action_type?: string
          button_text?: string
          categories?: string[] | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          form_fields?: Json | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url: string
          title: string
          updated_at?: string
          widget_type?: string
        }
        Update: {
          action_type?: string
          button_text?: string
          categories?: string[] | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          form_fields?: Json | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string
          title?: string
          updated_at?: string
          widget_type?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
      widget_clicks: {
        Row: {
          clicked_at: string
          id: string
          widget_id: string
        }
        Insert: {
          clicked_at?: string
          id?: string
          widget_id: string
        }
        Update: {
          clicked_at?: string
          id?: string
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_clicks_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "sidebar_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_form_submissions: {
        Row: {
          created_at: string
          data: Json
          id: string
          widget_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          widget_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_form_submissions_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "sidebar_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_impressions: {
        Row: {
          id: string
          viewed_at: string
          widget_id: string
        }
        Insert: {
          id?: string
          viewed_at?: string
          widget_id: string
        }
        Update: {
          id?: string
          viewed_at?: string
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_impressions_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "sidebar_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_ingest_item: {
        Args: never
        Returns: {
          angle: string | null
          article_id: string | null
          attempts: number
          bucket: string | null
          category_hint: string | null
          created_at: string
          error: string | null
          id: string
          priority: number
          published_at: string | null
          source_name: string
          source_published_at: string | null
          source_summary: string | null
          source_title: string
          status: string
          updated_at: string
          url: string
          url_key: string
        }
      }
      ingest_daily_stats: {
        Args: never
        Returns: {
          category_count: number
          daily_target: number
          lookback_hours: number
          published_today: number
          queue_buffer: number
          queued: number
        }[]
      }
      unsubscribe_newsletter: {
        Args: { _id: string }
        Returns: boolean
      }
      get_visitor_stats: {
        Args: never
        Returns: {
          unique_today: number
          unique_week: number
          unique_month: number
          unique_total: number
        }[]
      }
      set_featured_article: {
        Args: { _article_id: string | null }
        Returns: undefined
      }
      get_hot_articles: {
        Args: { p_hours?: number; p_limit?: number }
        Returns: {
          article_id: string
          views: number
        }[]
      }
      ingest_category_stats: {
        Args: never
        Returns: {
          bucket: string
          name: string
          published_today: number
          queued: number
        }[]
      }
      get_approved_comments: {
        Args: { p_article_id: string }
        Returns: {
          approved_at: string
          article_id: string
          author_name: string
          content: string
          created_at: string
          id: string
          is_approved: boolean
        }[]
      }
      get_article_daily_views: {
        Args: { p_article_id: string }
        Returns: {
          view_count: number
          view_date: string
        }[]
      }
      get_article_reaction_counts: {
        Args: { p_article_id: string }
        Returns: {
          dislikes: number
          likes: number
        }[]
      }
      get_article_stats: {
        Args: { p_article_id: string }
        Returns: {
          latest_view: string
          referrer: string
          view_count: number
        }[]
      }
      get_article_view_counts: {
        Args: never
        Returns: {
          article_id: string
          view_count: number
        }[]
      }
      get_course_outline: {
        Args: { p_course_id: string }
        Returns: {
          course_id: string
          description: string
          display_order: number
          duration_minutes: number
          id: string
          is_free: boolean
          module_id: string
          title: string
        }[]
      }
      get_user_article_reaction: {
        Args: { p_article_id: string; p_session_id: string }
        Returns: string
      }
      get_widget_click_counts: {
        Args: never
        Returns: {
          click_count: number
          widget_id: string
        }[]
      }
      get_widget_view_counts: {
        Args: never
        Returns: {
          view_count: number
          widget_id: string
        }[]
      }
      has_course_access: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      redeem_course_coupon: {
        Args: { p_code: string; p_course_id: string }
        Returns: {
          discount_percent: number
          grants_free_access: boolean
          message: string
          valid: boolean
        }[]
      }
      slugify_title: { Args: { _title: string }; Returns: string }
      submit_pending_comment: {
        Args: {
          p_article_id: string
          p_author_email: string
          p_author_name: string
          p_content: string
        }
        Returns: string
      }
      submit_widget_form: {
        Args: { p_data: Json; p_widget_id: string }
        Returns: string
      }
      subscribe_newsletter: {
        Args: {
          p_email: string
          p_full_name: string
          p_interest_category: string
          p_phone: string
        }
        Returns: string
      }
      toggle_article_reaction: {
        Args: {
          p_article_id: string
          p_reaction_type: string
          p_session_id: string
        }
        Returns: string
      }
      unique_article_slug: {
        Args: { _id: string; _title: string }
        Returns: string
      }
      validate_course_coupon: {
        Args: { p_code: string; p_course_id: string }
        Returns: {
          discount_percent: number
          grants_free_access: boolean
          message: string
          valid: boolean
        }[]
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
    },
  },
} as const

CREATE TABLE IF NOT EXISTS "opportunity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_json" json NOT NULL,
	"schema_version" text NOT NULL,
	"generation_mode" text NOT NULL,
	"requested_model" text NOT NULL,
	"returned_model" text,
	"generated_at" timestamp with time zone NOT NULL,
	"telemetry_start" timestamp with time zone NOT NULL,
	"telemetry_end" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_reports_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunity_reports_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "opportunity_reports"
      ADD CONSTRAINT "opportunity_reports_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opportunity_reports_workspace_id" ON "opportunity_reports" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opportunity_reports_status" ON "opportunity_reports" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opportunity_reports_generated_at" ON "opportunity_reports" USING btree ("generated_at" DESC);
--> statement-breakpoint
ALTER TABLE "opportunity_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "Allow all operations for service role" ON "opportunity_reports";
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'opportunity_reports' AND policyname = 'opportunity_reports_service_role_all'
  ) THEN
    CREATE POLICY "opportunity_reports_service_role_all" 
      ON "opportunity_reports" 
      FOR ALL 
      TO service_role 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'opportunity_reports' AND policyname = 'opportunity_reports_authenticated_select'
  ) THEN
    CREATE POLICY "opportunity_reports_authenticated_select" 
      ON "opportunity_reports" 
      FOR SELECT 
      TO authenticated 
      USING (true);
  END IF;
END $$;

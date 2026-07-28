CREATE TABLE "report_sessions" (
	"key" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"reporter_tag" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"labels" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_report_sessions_expires" ON "report_sessions" ("expires_at");

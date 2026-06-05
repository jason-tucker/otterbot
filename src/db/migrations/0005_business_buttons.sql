CREATE TABLE "business_buttons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"style" text DEFAULT 'primary' NOT NULL,
	"url" text,
	"body" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_discord_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_discord_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_buttons_business_idx" ON "business_buttons" ("business_id");

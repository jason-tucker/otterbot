CREATE TABLE "business_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"message_key" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_discord_id" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "business_messages_business_key_uq" ON "business_messages" ("business_id","message_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_messages_business_idx" ON "business_messages" ("business_id");

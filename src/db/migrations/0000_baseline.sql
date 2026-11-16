CREATE TABLE "business_role_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"role_name" text,
	"rank" text NOT NULL,
	"label" text,
	"is_base" boolean DEFAULT false NOT NULL,
	"auto_grant_employee" boolean DEFAULT false NOT NULL,
	"min_rank_to_assign" text DEFAULT 'manager' NOT NULL,
	CONSTRAINT "uq_role_per_guild" UNIQUE("guild_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"provider_type" text NOT NULL,
	"guild_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp,
	"updated_by" text,
	"deactivated_at" timestamp,
	"deactivated_by" text,
	CONSTRAINT "businesses_name_unique" UNIQUE("name"),
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "business_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"discord_user_id" text NOT NULL,
	"added_by_discord_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_owner_per_business" UNIQUE("business_id","discord_user_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"character_id" text NOT NULL,
	"character_name" text NOT NULL,
	"content" text NOT NULL,
	"author_discord_id" text NOT NULL,
	"author_name" text NOT NULL,
	"visibility" text DEFAULT 'staff' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"character_id" text NOT NULL,
	"character_name" text NOT NULL,
	"standing" text DEFAULT 'neutral' NOT NULL,
	"reason" text,
	"updated_by_discord_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_standing_per_business_char" UNIQUE("business_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"business_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oc_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_discord_id" text
);
--> statement-breakpoint
CREATE TABLE "lookup_sessions" (
	"key" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"character_name" text NOT NULL,
	"character_csn" text,
	"business_id" uuid NOT NULL,
	"target_discord_id" text,
	"rank" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"message_key" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_discord_id" text
);
--> statement-breakpoint
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
CREATE TABLE "report_sessions" (
	"key" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"reporter_tag" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD CONSTRAINT "business_role_mappings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_owners" ADD CONSTRAINT "business_owners_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_business_owners_user" ON "business_owners" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_notes_biz_char_created" ON "notes" USING btree ("business_id","character_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_standings_biz_standing" ON "standings" USING btree ("business_id","standing");--> statement-breakpoint
CREATE INDEX "idx_audit_biz_created" ON "audit_logs" USING btree ("business_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_actor_created" ON "audit_logs" USING btree ("actor_discord_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_lookup_sessions_expires" ON "lookup_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_messages_business_key_uq" ON "business_messages" USING btree ("business_id","message_key");--> statement-breakpoint
CREATE INDEX "business_messages_business_idx" ON "business_messages" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_buttons_business_idx" ON "business_buttons" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_report_sessions_expires" ON "report_sessions" USING btree ("expires_at");
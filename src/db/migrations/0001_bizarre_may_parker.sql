CREATE TABLE "business_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"discord_user_id" text NOT NULL,
	"added_by_discord_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_owner_per_business" UNIQUE("business_id","discord_user_id")
);
--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD COLUMN "role_name" text;--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD COLUMN "is_base" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD COLUMN "auto_grant_employee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_role_mappings" ADD COLUMN "min_rank_to_assign" text DEFAULT 'manager' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "deactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "deactivated_by" text;--> statement-breakpoint
ALTER TABLE "business_owners" ADD CONSTRAINT "business_owners_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
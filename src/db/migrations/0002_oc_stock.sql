CREATE TABLE "oc_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_discord_id" text
);
--> statement-breakpoint
INSERT INTO "oc_stock" ("name", "status", "sort_order") VALUES
	('Apron (With Polo Tee)', 'in_stock', 1),
	('Armour/Vest', 'in_stock', 2),
	('Backpack', 'in_stock', 3),
	('Baseball Cap', 'in_stock', 4),
	('Biker Helmet', 'in_stock', 5),
	('Chest Bag', 'in_stock', 6),
	('Duffelbag', 'in_stock', 7),
	('Face Bandana', 'in_stock', 8),
	('Joggers', 'in_stock', 9),
	('Lanyard', 'in_stock', 10),
	('Mechanic Overalls', 'in_stock', 11),
	('Neck Gaiter', 'in_stock', 12),
	('Open Jacket', 'in_stock', 13),
	('Pocket Flag', 'in_stock', 14),
	('T-Shirt', 'in_stock', 15),
	('Slim Hoodie', 'in_stock', 16),
	('Sweatshirt (Jumper)', 'in_stock', 17),
	('Zipped Jacket', 'in_stock', 18),
	('Baseball Tee (L-Sleeve Shirt)', 'low_stock', 19),
	('Hoodie', 'low_stock', 20),
	('Polo Tee', 'low_stock', 21),
	('Kuttes', 'out_of_stock', 22);

CREATE TABLE "app_keys" (
	"name" text PRIMARY KEY,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"reminder_minutes" integer NOT NULL,
	"time_zone" text NOT NULL,
	"last_sent_date" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_data" (
	"user_id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" bigint NOT NULL
);

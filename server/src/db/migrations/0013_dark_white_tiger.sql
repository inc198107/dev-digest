DROP INDEX "conventions_ws_repo_idx";--> statement-breakpoint
CREATE INDEX "conventions_repo_ws_idx" ON "conventions" USING btree ("repo_id","workspace_id");
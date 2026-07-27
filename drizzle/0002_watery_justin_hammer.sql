CREATE INDEX "idx_queue_page_created_at" ON "queue" USING btree ("tracked_page_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_scan_history_page_checked_at" ON "scan_history" USING btree ("tracked_page_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tracked_pages_watchlist" ON "tracked_pages" USING btree ("is_watchlisted");
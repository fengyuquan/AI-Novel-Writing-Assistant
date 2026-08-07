-- Persist refreshed provider model catalogs for local read paths.
ALTER TABLE "APIKey" ADD COLUMN "availableModelsJson" TEXT;

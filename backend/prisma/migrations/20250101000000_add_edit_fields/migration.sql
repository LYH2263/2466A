-- AlterTable
ALTER TABLE "asset_records" ADD COLUMN "edit_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "asset_records" ADD COLUMN "previous_snapshot" JSONB;

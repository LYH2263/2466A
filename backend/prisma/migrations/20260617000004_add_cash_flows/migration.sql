CREATE TABLE "cash_flows" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_record_id" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_flows_user_id_idx" ON "cash_flows"("user_id");
CREATE INDEX "cash_flows_user_id_date_idx" ON "cash_flows"("user_id", "date");
CREATE INDEX "cash_flows_asset_record_id_idx" ON "cash_flows"("asset_record_id");

ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_asset_record_id_fkey" FOREIGN KEY ("asset_record_id") REFERENCES "asset_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

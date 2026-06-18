CREATE TABLE "liability_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liability_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liability_records_user_id_idx" ON "liability_records"("user_id");
CREATE INDEX "liability_records_user_id_date_idx" ON "liability_records"("user_id", "date");

ALTER TABLE "liability_records" ADD CONSTRAINT "liability_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

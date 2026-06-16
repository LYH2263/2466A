CREATE TABLE "target_allocations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "warning_threshold" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "target_allocations_user_id_key" ON "target_allocations"("user_id");

ALTER TABLE "target_allocations" ADD CONSTRAINT "target_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

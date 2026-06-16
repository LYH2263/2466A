CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "target_amount" DECIMAL(15,2) NOT NULL,
    "target_date" DATE NOT NULL,
    "scope" VARCHAR(10) NOT NULL DEFAULT 'total',
    "category_id" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

CREATE INDEX "goals_user_id_scope_idx" ON "goals"("user_id", "scope");

ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

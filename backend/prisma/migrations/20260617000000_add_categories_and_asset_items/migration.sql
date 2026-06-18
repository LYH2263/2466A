-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_items" (
    "id" TEXT NOT NULL,
    "asset_record_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_user_id_deleted_at_idx" ON "categories"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_deleted_at_key" ON "categories"("user_id", "name", "deleted_at");

-- CreateIndex
CREATE INDEX "asset_items_asset_record_id_idx" ON "asset_items"("asset_record_id");

-- CreateIndex
CREATE INDEX "asset_items_category_id_idx" ON "asset_items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_items_asset_record_id_category_id_key" ON "asset_items"("asset_record_id", "category_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_items" ADD CONSTRAINT "asset_items_asset_record_id_fkey" FOREIGN KEY ("asset_record_id") REFERENCES "asset_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_items" ADD CONSTRAINT "asset_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================
-- Data Migration: Create default categories for existing users
-- =============================================
DO $$
DECLARE
    user_record RECORD;
    cash_category_id TEXT;
    invest_category_id TEXT;
    bond_category_id TEXT;
    asset_record RECORD;
BEGIN
    -- For each existing user, create the three default categories
    FOR user_record IN SELECT id FROM users LOOP
        -- 活钱 (Cash) - green
        INSERT INTO categories (id, user_id, name, color, sort_order, is_active, is_default, created_at, updated_at)
        VALUES (gen_random_uuid()::TEXT, user_record.id, '活钱', '#67c23a', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO cash_category_id;

        -- 长期投资 (Long Term Investment) - orange
        INSERT INTO categories (id, user_id, name, color, sort_order, is_active, is_default, created_at, updated_at)
        VALUES (gen_random_uuid()::TEXT, user_record.id, '长期投资', '#e6a23c', 1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO invest_category_id;

        -- 稳定债券 (Stable Bond) - blue
        INSERT INTO categories (id, user_id, name, color, sort_order, is_active, is_default, created_at, updated_at)
        VALUES (gen_random_uuid()::TEXT, user_record.id, '稳定债券', '#409eff', 2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO bond_category_id;

        -- Migrate existing asset records to asset_items for this user
        FOR asset_record IN SELECT id, user_id, cash, long_term_invest, stable_bond FROM asset_records WHERE user_id = user_record.id LOOP
            -- Insert cash item if > 0
            IF asset_record.cash > 0 THEN
                INSERT INTO asset_items (id, asset_record_id, category_id, amount, created_at)
                VALUES (gen_random_uuid()::TEXT, asset_record.id, cash_category_id, asset_record.cash, CURRENT_TIMESTAMP);
            END IF;

            -- Insert long term investment item if > 0
            IF asset_record.long_term_invest > 0 THEN
                INSERT INTO asset_items (id, asset_record_id, category_id, amount, created_at)
                VALUES (gen_random_uuid()::TEXT, asset_record.id, invest_category_id, asset_record.long_term_invest, CURRENT_TIMESTAMP);
            END IF;

            -- Insert stable bond item if > 0
            IF asset_record.stable_bond > 0 THEN
                INSERT INTO asset_items (id, asset_record_id, category_id, amount, created_at)
                VALUES (gen_random_uuid()::TEXT, asset_record.id, bond_category_id, asset_record.stable_bond, CURRENT_TIMESTAMP);
            END IF;
        END LOOP;
    END LOOP;
END $$;

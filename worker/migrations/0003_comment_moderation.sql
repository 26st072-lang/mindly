ALTER TABLE opinions ADD COLUMN deleted_by_admin INTEGER NOT NULL DEFAULT 0 CHECK(deleted_by_admin IN (0,1));

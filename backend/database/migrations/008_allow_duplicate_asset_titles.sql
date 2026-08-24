-- Judul merupakan metadata tampilan dan tidak perlu unik. URL/slug tetap unik.
-- Migrasi idempoten sehingga aman dijalankan ulang.
DROP INDEX IF EXISTS unique_active_title;

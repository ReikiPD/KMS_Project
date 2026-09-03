\set ON_ERROR_STOP on

-- Jalankan sebagai postgres setelah backup dan setelah role kms_migrator,
-- kms_app, serta kms_backup dibuat melalui createuser --pwprompt.
DO $$
DECLARE missing_roles text;
BEGIN
  SELECT string_agg(required_role, ', ')
    INTO missing_roles
  FROM unnest(ARRAY['kms_migrator', 'kms_app', 'kms_backup']) required_role
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = required_role);
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Role PostgreSQL belum tersedia: %', missing_roles;
  END IF;
END $$;

ALTER ROLE kms_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
ALTER ROLE kms_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
ALTER ROLE kms_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;

ALTER DATABASE kms_project OWNER TO kms_migrator;
REVOKE ALL ON DATABASE kms_project FROM PUBLIC, kms_app, kms_backup;
GRANT CONNECT ON DATABASE kms_project TO kms_app, kms_backup;

\connect kms_project

-- Pindahkan seluruh objek hasil restore lama dari runtime ke migrator.
REASSIGN OWNED BY kms_app TO kms_migrator;
ALTER SCHEMA public OWNER TO kms_migrator;

REVOKE ALL ON SCHEMA public FROM PUBLIC, kms_app, kms_backup;
GRANT USAGE ON SCHEMA public TO kms_app, kms_backup;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, kms_app, kms_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, kms_app, kms_backup;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, kms_app, kms_backup;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kms_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kms_app;

-- Audit aplikasi append-only. Migrator tetap menjadi satu-satunya pemilik objek.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM kms_app;
GRANT SELECT, INSERT ON TABLE audit_logs TO kms_app;

-- Penanda migrasi data hanya boleh diubah oleh pemilik skema/migrator.
REVOKE ALL ON TABLE data_migration_markers FROM kms_app;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO kms_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO kms_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO kms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO kms_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE kms_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO kms_backup;

ALTER ROLE kms_migrator SET search_path = public;
ALTER ROLE kms_app SET search_path = public;
ALTER ROLE kms_backup SET search_path = public;

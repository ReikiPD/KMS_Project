BEGIN;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment',
    'reply',
    'share',
    'asset_submitted',
    'asset_approved',
    'asset_revision',
    'asset_rejected'
  ));

COMMIT;

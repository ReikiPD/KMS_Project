const { hasPermission, canAccessStaffAccount, hasOrganizationScope } = require('./permissionService');
const { staffScopePredicate, unitScopePredicate } = require('./staffScopeService');

const hasCombinedAssetScope = subject => hasPermission(subject, 'assets', 'view') && canAccessStaffAccount(subject);

// Read scope is intentionally separate from the author-only mutation scope.
const assetReadPredicate = (subject, values, alias = 'a', { allowReview = false } = {}) => {
  if (subject?.environmentAdmin) return 'TRUE';
  const scopes = [];
  if (hasPermission(subject, 'assets', 'view')) {
    if (subject?.id) scopes.push(`${alias}.author_id = $${values.push(subject.id)}`);
    if (hasCombinedAssetScope(subject)) scopes.push(`EXISTS (SELECT 1 FROM users asset_owner
      WHERE asset_owner.id = ${alias}.author_id AND ${staffScopePredicate(subject, values, 'asset_owner')})`);
  }
  // Verification retains its separate material/unit scope, including delegation boundaries.
  if (allowReview && hasPermission(subject, 'asset_verification', 'view')) {
    scopes.push(`(${unitScopePredicate(subject, values, `${alias}.work_unit_id`, hasOrganizationScope(subject))})`);
  }
  return scopes.length ? `(${scopes.join(' OR ')})` : 'FALSE';
};

const requestedAssetReadPredicate = (req, values, alias = 'a', { recovery = false } = {}) => {
  const subject = req.accessContext || req.user;
  // Recovery remains a separate pre-existing permission, not part of the combined live list.
  const scope = recovery && hasOrganizationScope(subject) && hasPermission(subject, 'asset_recovery', 'view')
    ? 'TRUE' : assetReadPredicate(subject, values, alias);
  const author = req.query?.authorId;
  if (author === undefined || author === '') return scope;
  if (!/^[1-9]\d*$/.test(String(author)) || !Number.isSafeInteger(Number(author))) {
    throw Object.assign(new Error('Referensi pemilik aset tidak valid'), { status: 400 });
  }
  return `${scope} AND ${alias}.author_id = $${values.push(Number(author))}`;
};

const assetCapabilities = (subject, asset) => {
  const owner = Boolean(subject?.environmentAdmin || (subject?.id && Number(asset.author_id ?? asset.author?.id) === Number(subject.id)));
  const writable = owner && !subject?.read_only && !asset.deleted_at;
  return {
    can_edit: writable && hasPermission(subject, 'assets', 'edit') && asset.publication_status !== 'pending_review',
    can_delete: writable && hasPermission(subject, 'assets', 'delete'),
    can_feature: writable && hasPermission(subject, 'assets', 'edit'),
    can_download: owner || asset.allow_download !== false,
  };
};

module.exports = { assetReadPredicate, requestedAssetReadPredicate, assetCapabilities, hasCombinedAssetScope };

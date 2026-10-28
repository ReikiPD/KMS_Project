export const assetContextKey = (authenticatedUser, user, isEmployeeContext) => JSON.stringify([
  authenticatedUser?.id,
  user.id,
  user.environmentAdmin,
  isEmployeeContext,
  user.read_only,
  user.work_unit_id,
  user.organization_scope,
  user.staff_scope_boundaries,
  user.permissions,
]);

export const PERMISSION_ACTIONS = ["view", "post", "edit", "delete"];

export const hasPermission = (user, resource, action = "view") => (
  Boolean(user?.environmentAdmin) || Boolean(user?.permissions?.[resource]?.[action])
);

export const canAccessAny = (user, resource, actions = PERMISSION_ACTIONS) => (
  actions.some((action) => hasPermission(user, resource, action))
);

const CONTEXT_PRIVATE_RESOURCES = new Set(["activity", "profile"]);

export const buildContextAccessUser = (actor, target, { readOnly = false } = {}) => {
  if (!actor || !target?.role) return actor;
  const resourceKeys = new Set([
    ...Object.keys(actor.permissions || {}),
    ...Object.keys(target.permissions || {}),
  ]);
  const permissions = Object.fromEntries([...resourceKeys].map((resource) => [
    resource,
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [
      action,
      (!readOnly || action === "view")
        && !CONTEXT_PRIVATE_RESOURCES.has(resource)
        && hasPermission(actor, resource, action)
        && target.permissions?.[resource]?.[action] === true,
    ])),
  ]));
  return {
    ...actor,
    id: target.id,
    public_id: target.public_id,
    full_name: target.full_name,
    email: target.email,
    department: target.department,
    work_unit_id: target.work_unit_id,
    work_unit_public_id: target.work_unit_public_id,
    work_unit_name: target.work_unit_name,
    work_unit_alias: target.work_unit_alias,
    work_unit_echelon_level: target.work_unit_echelon_level,
    role: target.role,
    permissions,
    environmentAdmin: false,
    actorAccount: {
      id: actor.id,
      public_id: actor.public_id,
      full_name: actor.full_name,
      role: actor.role,
    },
    contextAccount: {
      id: target.id,
      public_id: target.public_id,
      full_name: target.full_name,
      role: target.role,
    },
  };
};

const BACKOFFICE_ENTRY_POINTS = [
  ["dashboard", "/admin/dashboard"],
  ["assets", "/admin/assets"],
  ["asset_recovery", "/admin/assets/recovery"],
  ["asset_verification", "/admin/asset-verification"],
  ["staff_management", "/admin/staff"],
  ["role_permissions", "/admin/role-permissions"],
  ["categories", "/admin/categories"],
  ["work_units", "/admin/work-units"],
  ["announcements", "/admin/announcements"],
  ["activity", "/admin/activity"],
  ["profile", "/admin/profile"],
];

export const firstAllowedBackofficePath = (user) => (
  BACKOFFICE_ENTRY_POINTS.find(([resource]) => hasPermission(user, resource, "view"))?.[1]
  || ([1, 2, 3].some((level) => hasPermission(user, `analytics_echelon_${level}`, "view")) && user?.work_unit_public_id
    ? "/admin/work-units/analytics"
    : "/")
);

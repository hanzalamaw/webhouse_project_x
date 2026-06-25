export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

export function isSuperAdminRoleName(name) {
  return String(name || "").trim() === SUPER_ADMIN_ROLE_NAME;
}

export function isSuperAdminRole(role) {
  if (!role) return false;
  return isSuperAdminRoleName(role.role_name);
}

export function isSuperAdminUser(user) {
  return isSuperAdminRoleName(user?.role_name);
}

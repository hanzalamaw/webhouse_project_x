import jwt from "jsonwebtoken";
import crypto from "crypto";
import { tenantRepository } from "../repositories/tenantRepository.js";
import { sessionRepository } from "../repositories/sessionRepository.js";
import { logWhAudit } from "../utils/whAudit.js";
import { tenantPermissionService } from "./tenantPermissionService.js";

const toTenantUserPayload = (user, tenant, impersonatedBy) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username || user.email,
  status: user.status,
  portal: "tenant",
  tenant_id: tenant.id,
  tenant_name: tenant.company_name,
  login_portal: tenant.login_portal,
  impersonating: true,
  impersonated_by: impersonatedBy,
});

export function createImpersonationService({ jwtSecret, jwtExpiresIn, jwtRefreshExpiresIn }) {
  return {
    async start(tenantId, adminUserId, ip, deviceInfo) {
      const tenant = await tenantRepository.findById(tenantId);
      if (!tenant) throw new Error("Tenant not found");
      if (tenant.status !== "active") throw new Error("Tenant is not active");
      if (!tenant.login_portal) throw new Error("Tenant has no ERP portal configured");

      const user = await tenantRepository.getSuperAdminUser(tenantId);
      if (!user) throw new Error("No super admin found for this tenant");

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionId = await sessionRepository.create({
        sessionToken,
        ipAddress: ip,
        deviceInfo: `impersonation:wh_admin:${adminUserId}; ${deviceInfo || ""}`.trim(),
        tenantId,
        userId: user.id,
      });

      const token = jwt.sign(
        { id: user.id, role: "tenant", tenantId, sessionId, impersonatedBy: adminUserId },
        jwtSecret,
        { expiresIn: jwtExpiresIn }
      );
      const refreshToken = jwt.sign(
        { id: user.id, role: "tenant", tenantId, sessionId, impersonatedBy: adminUserId, type: "refresh" },
        jwtSecret,
        { expiresIn: jwtRefreshExpiresIn }
      );

      await logWhAudit({
        adminUserId,
        action: "impersonate_start",
        oldValue: null,
        newValue: { tenant_id: tenantId, company_name: tenant.company_name, user_id: user.id },
        ipAddress: ip,
      });

      return {
        token,
        refreshToken,
        user: await tenantPermissionService.enrichUserPayload(
          toTenantUserPayload(user, tenant, adminUserId),
          tenantId,
          { impersonating: true }
        ),
      };
    },
  };
}

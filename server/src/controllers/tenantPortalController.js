import { tenantPortalService } from "../services/tenantPortalService.js";
import { sessionRepository } from "../repositories/sessionRepository.js";

function auditCtx(req) {
  return {
    tenantId: req.tenantId,
    userId: req.userId,
    impersonatedBy: req.impersonatedBy,
  };
}

export function createTenantPortalMiddleware({ assertTenantSessionActive }) {
  const requireTenant = (req, res, next) => {
    if (req.userRole !== "tenant") return res.status(403).json({ message: "Forbidden" });
    next();
  };

  const requireSession = async (req, res, next) => {
    if (req.userRole !== "tenant") return next();
    if (req.impersonatedBy) return next();
    const active = await assertTenantSessionActive(req.sessionId);
    if (!active) return res.status(401).json({ message: "Session terminated" });
    next();
  };

  return { requireTenant, requireSession };
}

export const tenantPortalController = {
  async organizationGet(req, res) {
    try {
      const data = await tenantPortalService.getOrganization(req.tenantId);
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async organizationPut(req, res) {
    try {
      const data = await tenantPortalService.updateOrganization(req, req.body);
      res.json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },

  async usersList(req, res) {
    try {
      res.json(await tenantPortalService.listUsers(req.tenantId));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async usersCreate(req, res) {
    try {
      const data = await tenantPortalService.createUser(req, req.body);
      res.status(201).json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },

  async usersUpdate(req, res) {
    try {
      const data = await tenantPortalService.updateUser(req, Number(req.params.id), req.body);
      if (!data) return res.status(404).json({ message: "User not found" });
      res.json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },

  async rolesList(req, res) {
    try {
      const data = await tenantPortalService.listRoles(req.tenantId);
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async rolesGet(req, res) {
    try {
      const data = await tenantPortalService.getRole(req.tenantId, Number(req.params.id));
      if (!data) return res.status(404).json({ message: "Role not found" });
      res.json({ data });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async rolesCreate(req, res) {
    try {
      const data = await tenantPortalService.createRole(req, req.body);
      res.status(201).json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },

  async rolesUpdate(req, res) {
    try {
      const data = await tenantPortalService.updateRole(req, Number(req.params.id), req.body);
      if (!data) return res.status(404).json({ message: "Role not found" });
      res.json({ data });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  },

  async sessionsList(req, res) {
    try {
      res.json(await tenantPortalService.listSessions(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async sessionsTerminate(req, res) {
    try {
      const ok = await tenantPortalService.terminateSession(req, Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Session not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async auditLogs(req, res) {
    try {
      res.json(await tenantPortalService.listAuditLogs(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async alertsList(req, res) {
    try {
      res.json(await tenantPortalService.listAlerts(req.tenantId, req.query));
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async alertsMarkRead(req, res) {
    try {
      const ok = await tenantPortalService.markAlertRead(req.tenantId, Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Alert not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async subscriptionBilling(req, res) {
    try {
      res.json({ data: await tenantPortalService.getSubscriptionBilling(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  async dashboard(req, res) {
    try {
      res.json({ data: await tenantPortalService.getDashboardStats(req.tenantId) });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },
};

export { sessionRepository };

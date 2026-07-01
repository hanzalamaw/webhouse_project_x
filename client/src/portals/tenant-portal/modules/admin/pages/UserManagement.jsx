import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { FormPageAlerts } from "../../../../../components/FormPageLayout";
import { AccountDetailsModal } from "../../../../../components/AccountDetailsModal";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, loginPortalUrl, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";
import { buildUserLoginSections } from "../../../../../utils/accountDetails";

const MODULE_BASE = "/app/m/admin";

export default function UserManagement() {
  const navigate = useNavigate();
  const { authFetch, user: authUser } = useAuth();
  const { canCreate, canEdit } = useModulePermission("admin");
  const [rows, setRows] = useState([]);
  const [limits, setLimits] = useState({ max_users: 0, active_count: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsSections, setDetailsSections] = useState([]);
  const [detailsTitle, setDetailsTitle] = useState("User sign-in details");

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at" });

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/tenant/users", {}, authFetch);
      setRows(res.data || []);
      setLimits(res.limits || { max_users: 0, active_count: 0 });
    } catch (err) {
      setError(err.message || "Failed to load users");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetails = async (row) => {
    setDetailsLoading(true);
    setDetailsError("");
    setDetailsOpen(true);
    setDetailsTitle(`Credentials — ${row.name || row.username}`);
    setDetailsSections([]);
    try {
      const data = await apiFetch(`/tenant/users/${row.id}/credentials`, {}, authFetch);
      setDetailsSections(
        buildUserLoginSections({
          loginLink: loginPortalUrl(data.login_portal || authUser?.login_portal || "erp1"),
          username: data.username,
          password: data.password || "—",
        })
      );
    } catch (err) {
      setDetailsError(err.message || "Could not load user details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const columns = [
    { key: "name", label: "Name" },
    { key: "username", label: "Username" },
    { key: "email", label: "Email" },
    { key: "role_name", label: "Role" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    { key: "created_at", label: "Created", format: (v) => (v ? formatDateTime(v) : "—") },
    { key: "last_login_at", label: "Last Login", format: (v) => (v ? formatDateTime(v) : "—") },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={(e) => { e.stopPropagation(); openDetails(row); }}>
            Credentials
          </Button>
          <Button
            variant="secondary"
            className="wh-btn--sm"
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${MODULE_BASE}/user-management/edit/${row.id}`);
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="User Management"
        description={`Active users: ${limits.active_count}/${limits.max_users}. Users can be set active or inactive — no delete.`}
        actions={
          <Button
            onClick={() => navigate(`${MODULE_BASE}/user-management/create`)}
            disabled={!canCreate || limits.active_count >= limits.max_users}
          >
            Add User
          </Button>
        }
      />
      <FormPageAlerts error={error} message={message} />
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              searchPlaceholder="Search users…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/user-management/view/${row.id}`)}
            />
          </>
        )}
      </Card>

      <AccountDetailsModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsSections([]);
          setDetailsError("");
        }}
        title={detailsTitle}
        sections={detailsSections}
        loading={detailsLoading}
        error={detailsError}
      />
    </div>
  );
}

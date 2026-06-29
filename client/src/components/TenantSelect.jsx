import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "./SearchableSelect";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api/client";

export function TenantSelect({ id = "tenant", label = "Tenant", value, onChange, disabled = false }) {
  const { authFetch } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch("/tenants?page=1&limit=500&all=1", {}, authFetch)
      .then((r) => setTenants(r.data || []))
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [authFetch]);

  const options = useMemo(
    () =>
      tenants
        .map((t) => ({ value: String(t.id), label: t.company_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tenants]
  );

  return (
    <SearchableSelect
      id={id}
      label={label}
      value={value ? String(value) : ""}
      onChange={onChange}
      options={options}
      loading={loading}
      emptyMessage="No tenants found"
      disabled={disabled}
    />
  );
}

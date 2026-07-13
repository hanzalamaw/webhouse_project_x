/** Shared loading shell for tenant routes — avoids blank flashes between hub and modules. */
export default function TenantRouteLoading({ label = "Loading…" }) {
  return (
    <div className="wh-tenant-route-loading" aria-busy="true" aria-live="polite">
      <p className="wh-muted">{label}</p>
    </div>
  );
}

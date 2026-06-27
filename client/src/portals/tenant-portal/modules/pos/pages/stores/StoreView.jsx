import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";
import { FormField } from "../../../../../../components/FormField";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE, TERMINAL_STATUSES, TERMINAL_STATUS_LABELS } from "../../constants";
import { ProductIcon, LogsIcon, SubscriptionIcon, TenantsIcon } from "../../../../../../components/icons";

function Kpi({ label, value, hint, tone = "default", icon }) {
  return (
    <div className={`wh-kpi wh-kpi--${tone}`}>
      <div className="wh-kpi__top">
        <span className="wh-kpi__label">{label}</span>
        {icon && <span className="wh-kpi__icon">{icon}</span>}
      </div>
      <span className="wh-kpi__value">{value}</span>
      {hint && <span className="wh-kpi__hint">{hint}</span>}
    </div>
  );
}

function Panel({ title, subtitle, children, flush, action }) {
  return (
    <div className="wh-panel">
      <div className="wh-panel__head">
        <div>
          <h3 className="wh-panel__title">{title}</h3>
          {subtitle && <p className="wh-panel__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

const EMPTY_TERMINAL = { terminal_name: "", device_code: "", status: "active" };

export default function StoreView() {
  const { storeId } = useParams();
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("pos");
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTerminalForm, setShowTerminalForm] = useState(false);
  const [terminalForm, setTerminalForm] = useState(EMPTY_TERMINAL);
  const [savingTerminal, setSavingTerminal] = useState(false);
  const [terminalError, setTerminalError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch(`/pos/outlets/${storeId}/dashboard`, {}, authFetch));
    } catch (e) {
      setData(null);
      setError(e.message || "Store not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, storeId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const addTerminal = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setSavingTerminal(true);
    setTerminalError("");
    try {
      await apiFetch("/pos/terminals", {
        method: "POST",
        body: JSON.stringify({ ...terminalForm, outlet_id: Number(storeId) }),
      }, authFetch);
      setTerminalForm(EMPTY_TERMINAL);
      setShowTerminalForm(false);
      await load();
    } catch (err) {
      setTerminalError(err.message);
    } finally {
      setSavingTerminal(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading store…</p>
      </div>
    );
  }

  if (!data?.outlet) {
    return (
      <div className="wh-page">
        <p className="wh-field__error">{error || "Store not found"}</p>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/manage`)}>All stores</Button>
      </div>
    );
  }

  const { outlet, stats } = data;
  const money = (n) => formatPKR(n);

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title={outlet.outlet_name}
        description={[outlet.city, outlet.location].filter(Boolean).join(" · ") || "Store overview"}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/manage`)}>All stores</Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/stores/edit/${storeId}`)}>Edit store</Button>
            )}
            {canCreate && (
              <Button onClick={() => setShowTerminalForm((v) => !v)}>
                {showTerminalForm ? "Cancel terminal" : "Add terminal"}
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="wh-field__error">{error}</p>}

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi label="Sales today" value={stats.sales_today} hint="Transactions today" tone="accent" icon={<LogsIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Revenue today" value={money(stats.revenue_today)} hint="Payable amount" tone="success" />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Open registers" value={stats.open_registers} hint="Active shifts" tone="warning" icon={<SubscriptionIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Total sales" value={stats.total_sales} hint="All time at this store" />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <Kpi label="Terminals" value={stats.terminal_count} icon={<ProductIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Lifetime revenue" value={money(stats.total_revenue)} tone="success" />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Opening balance" value={money(outlet.opening_balance)} hint="First shift default" icon={<TenantsIcon />} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label="Status"
            value={<StatusBadge status={outlet.status} />}
            hint={outlet.store_open_time ? `Opens ${String(outlet.store_open_time).slice(0, 5)}` : undefined}
          />
        </div>
      </div>

      {showTerminalForm && canCreate && (
        <Card style={{ marginBottom: 16 }}>
          <h3 className="wh-card__title">Add terminal</h3>
          <form onSubmit={addTerminal} className="wh-form-stack" style={{ marginTop: 12 }}>
            <div className="wh-form-grid wh-form-grid--3">
              <FormField id="terminal_name" label="Terminal name" value={terminalForm.terminal_name} onChange={(e) => setTerminalForm((f) => ({ ...f, terminal_name: e.target.value }))} required />
              <FormField id="device_code" label="Machine code" value={terminalForm.device_code} onChange={(e) => setTerminalForm((f) => ({ ...f, device_code: e.target.value }))} required />
              <FormField id="status" label="Status" as="select" value={terminalForm.status} onChange={(e) => setTerminalForm((f) => ({ ...f, status: e.target.value }))}>
                {TERMINAL_STATUSES.map((s) => <option key={s} value={s}>{TERMINAL_STATUS_LABELS[s] || s}</option>)}
              </FormField>
            </div>
            {terminalError && <p className="wh-field__error">{terminalError}</p>}
            <div className="wh-action-btns">
              <Button type="submit" disabled={savingTerminal}>{savingTerminal ? "Adding…" : "Add terminal"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="wh-dash-grid">
        <div className="wh-dash-col-6">
          <Panel title="Terminals" subtitle="Checkout devices at this store" flush>
            {(data.terminals || []).length ? (
              <div className="wh-mini-list">
                {data.terminals.map((t) => (
                  <div className="wh-mini-row" key={t.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{t.terminal_name}</div>
                      <div className="wh-mini-row__sub">Code: {t.device_code}</div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No terminals yet.</p>
            )}
          </Panel>
        </div>
        <div className="wh-dash-col-6">
          <Panel
            title="Recent sales"
            subtitle="Latest transactions"
            flush
            action={<Link to={`${MODULE_BASE}/sales`} className="wh-link">View all</Link>}
          >
            {(data.recent_sales || []).length ? (
              <div className="wh-mini-list">
                {data.recent_sales.map((s) => (
                  <div className="wh-mini-row" key={s.id}>
                    <div className="wh-mini-row__main">
                      <div className="wh-mini-row__title">{s.sale_no}</div>
                      <div className="wh-mini-row__sub">{s.terminal_name} · {formatDateTime(s.created_at)}</div>
                    </div>
                    <span className="wh-mini-row__value">{formatPKR(s.payable_amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="wh-panel__empty">No sales at this store yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Register shifts" subtitle="Recent cashier shifts at this store" flush>
        {(data.registers || []).length ? (
          <div className="wh-mini-list">
            {data.registers.map((r) => (
              <div className="wh-mini-row" key={r.id}>
                <div className="wh-mini-row__main">
                  <div className="wh-mini-row__title">{r.terminal_name}</div>
                  <div className="wh-mini-row__sub">
                    Opened {formatDateTime(r.opened_at)} by {r.opened_by_name}
                    {r.closed_at ? ` · Closed ${formatDateTime(r.closed_at)}` : " · Open"}
                  </div>
                </div>
                <span className="wh-mini-row__value">
                  {r.closed_at ? formatPKR(r.closing_balance) : formatPKR(Number(r.opening_balance) + Number(r.cash_collected))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="wh-panel__empty">No register shifts yet.</p>
        )}
      </Panel>
    </div>
  );
}

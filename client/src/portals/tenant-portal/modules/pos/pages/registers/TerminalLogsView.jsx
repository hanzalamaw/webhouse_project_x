import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";

function Panel({ title, children, flush }) {
  return (
    <div className="wh-panel" style={{ marginBottom: 16 }}>
      <div className="wh-panel__head"><h3 className="wh-panel__title">{title}</h3></div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

export default function TerminalLogsView() {
  const { terminalId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch(`/pos/terminals/${terminalId}/logs`, {}, authFetch));
    } catch (e) {
      setData(null);
      setError(e.message || "Terminal not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, terminalId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;
  if (!data?.terminal) {
    return (
      <div className="wh-page">
        <p className="wh-field__error">{error || "Terminal not found"}</p>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/registers`)}>Back</Button>
      </div>
    );
  }

  const { terminal, open_register, registers, sales } = data;
  const liveBalance = open_register
    ? Number(open_register.opening_balance) + Number(open_register.cash_collected)
    : null;

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title={terminal.terminal_name}
        description={`${terminal.outlet_name} · Machine code ${terminal.device_code}`}
        actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/registers`)}>All terminals</Button>}
      />

      <div className="wh-dash-grid" style={{ marginBottom: 16 }}>
        <div className="wh-dash-col-3">
          <div className="wh-kpi">
            <span className="wh-kpi__label">Status</span>
            <span className="wh-kpi__value"><StatusBadge status={open_register ? "active" : "inactive"} /></span>
          </div>
        </div>
        <div className="wh-dash-col-3">
          <div className="wh-kpi">
            <span className="wh-kpi__label">Live balance</span>
            <span className="wh-kpi__value">{liveBalance != null ? formatPKR(liveBalance) : "—"}</span>
          </div>
        </div>
        <div className="wh-dash-col-3">
          <div className="wh-kpi">
            <span className="wh-kpi__label">Terminal</span>
            <span className="wh-kpi__value"><StatusBadge status={terminal.status} /></span>
          </div>
        </div>
      </div>

      <Panel title="Register shifts" flush>
        {(registers || []).length ? (
          <div className="wh-mini-list">
            {registers.map((r) => (
              <div className="wh-mini-row" key={r.id}>
                <div className="wh-mini-row__main">
                  <div className="wh-mini-row__title">
                    {r.closed_at ? "Closed shift" : "Open shift"}
                  </div>
                  <div className="wh-mini-row__sub">
                    Opened {formatDateTime(r.opened_at)} by {r.opened_by_name}
                    {r.closed_at ? ` · Closed ${formatDateTime(r.closed_at)} by ${r.closed_by_name || "—"}` : ""}
                  </div>
                </div>
                <span className="wh-mini-row__value">
                  {r.closed_at
                    ? formatPKR(r.closing_balance)
                    : formatPKR(Number(r.opening_balance) + Number(r.cash_collected))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="wh-panel__empty">No register shifts yet.</p>
        )}
      </Panel>

      <Panel title="Sales" flush>
        {(sales || []).length ? (
          <div className="wh-mini-list">
            {sales.map((s) => (
              <div className="wh-mini-row" key={s.id}>
                <div className="wh-mini-row__main">
                  <div className="wh-mini-row__title">{s.sale_no}</div>
                  <div className="wh-mini-row__sub">
                    {formatDateTime(s.created_at)} · {s.cashier_name}
                    {s.customer_name ? ` · ${s.customer_name}` : ""}
                  </div>
                </div>
                <span className="wh-mini-row__value">{formatPKR(s.payable_amount)}</span>
                <StatusBadge status={s.payment_status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="wh-panel__empty">No sales on this terminal yet.</p>
        )}
      </Panel>
    </div>
  );
}

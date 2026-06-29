import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { StatusBadge } from "../../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";

const TOOLBAR_FILTERS = [
  { key: "outlet_name", label: "Store" },
  { key: "terminal_name", label: "Terminal" },
  { key: "shift_status", label: "Status", options: ["open", "closed"] },
];

export default function ManageRegisters() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState(EMPTY_TOOLBAR);

  const filteredTerminals = useToolbarFilteredRows(terminals, toolbar, {
    filters: TOOLBAR_FILTERS,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/pos/registers/terminals", {}, authFetch);
      setTerminals(res.data || res || []);
    } catch (err) {
      setError(err.message);
      setTerminals([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Cash registers"
        description="Live terminal balances. Click a card to view shift and sales logs."
      />
      {error && <p className="wh-field__error">{error}</p>}

      {loading ? (
        <p className="wh-muted">Loading…</p>
      ) : (
        <>
          <TableToolbar
            rows={terminals}
            value={toolbar}
            onChange={setToolbar}
            filters={TOOLBAR_FILTERS}
            searchPlaceholder="Search terminals…"
          />
          <div className="wh-terminal-cards">
            {filteredTerminals.length ? (
              filteredTerminals.map((t) => {
                const shiftOpen = t.shift_status === "open";
                const terminalActive = String(t.status || "active").toLowerCase() === "active";
                return (
                <button
                  type="button"
                  key={t.id}
                  className={`wh-terminal-card wh-terminal-card--clickable wh-terminal-card--${t.shift_status}`}
                  onClick={() => navigate(`${MODULE_BASE}/registers/terminal/${t.id}`)}
                >
                  <div className="wh-terminal-card__head">
                    <div className="wh-terminal-card__identity">
                      <h4 className="wh-terminal-card__title">{t.terminal_name}</h4>
                      <p className="wh-terminal-card__store">{t.outlet_name}</p>
                    </div>
                    <div className="wh-terminal-card__badges">
                      <StatusBadge status={shiftOpen ? "active" : "inactive"} />
                    </div>
                  </div>

                  <div className="wh-terminal-card__chips">
                    <span className="wh-terminal-card__chip">Code {t.device_code}</span>
                    <span className="wh-terminal-card__chip">
                      {terminalActive ? "Terminal active" : "Terminal inactive"}
                    </span>
                  </div>

                  <div className="wh-terminal-card__stats">
                    <div className="wh-terminal-card__stat">
                      <span className="wh-terminal-card__stat-label">Drawer balance</span>
                      <strong className="wh-terminal-card__stat-value">
                        {shiftOpen && t.current_balance != null ? formatPKR(t.current_balance) : "—"}
                      </strong>
                    </div>
                    <div className="wh-terminal-card__stat">
                      <span className="wh-terminal-card__stat-label">Cash collected</span>
                      <strong className="wh-terminal-card__stat-value">
                        {shiftOpen ? formatPKR(t.cash_collected || 0) : "—"}
                      </strong>
                    </div>
                    <div className="wh-terminal-card__stat">
                      <span className="wh-terminal-card__stat-label">Opening float</span>
                      <strong className="wh-terminal-card__stat-value">
                        {shiftOpen ? formatPKR(t.opening_balance || 0) : "—"}
                      </strong>
                    </div>
                    <div className="wh-terminal-card__stat">
                      <span className="wh-terminal-card__stat-label">Shift status</span>
                      <strong className="wh-terminal-card__stat-value">
                        {shiftOpen ? "Open" : "Closed"}
                      </strong>
                    </div>
                  </div>

                  <p className="wh-terminal-card__footer wh-muted">
                    {shiftOpen && t.opened_at
                      ? `Shift opened ${formatDateTime(t.opened_at)} · tap for sales and shift logs`
                      : shiftOpen
                        ? "Shift open · tap for sales and shift logs"
                        : "No open shift · tap to view past shifts and sales"}
                  </p>
                </button>
              );
              })
            ) : (
              <p className="wh-muted">No terminals match your filters.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

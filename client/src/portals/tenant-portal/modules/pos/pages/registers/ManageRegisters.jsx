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
              filteredTerminals.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`wh-terminal-card wh-terminal-card--clickable wh-terminal-card--${t.shift_status}`}
                  onClick={() => navigate(`${MODULE_BASE}/registers/terminal/${t.id}`)}
                >
                  <div className="wh-terminal-card__head">
                    <h4 className="wh-terminal-card__title">{t.terminal_name}</h4>
                    <StatusBadge status={t.shift_status === "open" ? "active" : "inactive"} />
                  </div>
                  <p className="wh-terminal-card__store">{t.outlet_name}</p>
                  <p className="wh-terminal-card__meta wh-muted">Code: {t.device_code}</p>
                  <div className="wh-terminal-card__balance">
                    <span className="wh-muted">Balance</span>
                    <strong>
                      {t.shift_status === "open" && t.current_balance != null
                        ? formatPKR(t.current_balance)
                        : "—"}
                    </strong>
                  </div>
                  <p className="wh-terminal-card__meta wh-muted">
                    {t.shift_status === "open" ? "Shift open · tap for logs" : "No open shift · tap for logs"}
                  </p>
                </button>
              ))
            ) : (
              <p className="wh-muted">No terminals match your filters.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

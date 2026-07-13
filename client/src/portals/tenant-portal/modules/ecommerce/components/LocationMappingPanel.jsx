import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";

const SKIP = "skip";
const CREATE = "create";

function capacityText(cap, noun) {
  if (!cap) return "";
  if (cap.limit <= 0) return `${cap.count} ${noun} (no plan limit)`;
  return `${cap.count} / ${cap.limit} ${noun} used`;
}

/** Rows for the warehouse/outlet target <select>: skip, create new, or an existing target. */
function warehouseOptions(warehouses, canCreate, currentLocationId) {
  return (
    <>
      <option value={SKIP}>Don’t map</option>
      <option value={CREATE} disabled={!canCreate}>
        {canCreate ? "Create new warehouse" : "Create new warehouse (limit reached)"}
      </option>
      {(warehouses || []).map((item) => {
        const takenElsewhere = item.mappedLocationId && item.mappedLocationId !== currentLocationId;
        return (
          <option key={item.id} value={`existing:${item.id}`} disabled={takenElsewhere}>
            {item.name}
            {takenElsewhere ? " (mapped to another location)" : ""}
          </option>
        );
      })}
    </>
  );
}

function targetOptions(list, canCreate, nounCreate) {
  return (
    <>
      <option value={SKIP}>Don’t map</option>
      <option value={CREATE} disabled={!canCreate}>
        {canCreate ? `Create new ${nounCreate}` : `Create new ${nounCreate} (limit reached)`}
      </option>
      {list.map((item) => (
        <option key={item.id} value={`existing:${item.id}`}>
          {item.name}
        </option>
      ))}
    </>
  );
}

export default function LocationMappingPanel({ platform = "shopify", authFetch: authFetchProp }) {
  const auth = useAuth();
  const authFetch = authFetchProp || auth.authFetch;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [choices, setChoices] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ecomApiGet(platform, "locations", authFetch);
      setData(res);
      const initial = {};
      for (const loc of res.locations || []) {
        initial[loc.shopifyLocationId] = {
          warehouse: loc.warehouseId ? `existing:${loc.warehouseId}` : SKIP,
          outlet: loc.outletId ? `existing:${loc.outletId}` : SKIP,
        };
      }
      setChoices(initial);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const unmappedCount = useMemo(
    () => (data?.locations || []).filter((l) => !l.mapped).length,
    [data],
  );

  const setChoice = (locId, field, value) => {
    setChoices((prev) => ({
      ...prev,
      [locId]: { ...prev[locId], [field]: value },
    }));
  };

  const parseAction = (value) => {
    if (!value || value === SKIP) return { action: SKIP };
    if (value === CREATE) return { action: CREATE };
    return { action: "existing", id: Number(value.split(":")[1]) };
  };

  const save = async () => {
    setSaving(true);
    setNotice("");
    try {
      const selections = Object.entries(choices).map(([shopifyLocationId, c]) => {
        const wh = parseAction(c.warehouse);
        const out = parseAction(c.outlet);
        return {
          shopifyLocationId,
          warehouseAction: wh.action,
          warehouseId: wh.id,
          outletAction: out.action,
          outletId: out.id,
        };
      });
      const res = await ecomApiPost(platform, "locations/import", authFetch, { selections });
      const failed = (res.results || []).filter((r) => !r.ok);
      setData(res);
      if (failed.length) {
        setNotice(failed.map((f) => f.error).filter(Boolean).join(" ") || "Some locations could not be mapped.");
      } else {
        setNotice(
          platform === "daraz"
            ? "Daraz warehouses mapped to your ERP warehouses."
            : "Locations mapped to your warehouses and outlets.",
        );
      }
      await load();
    } catch (err) {
      setNotice(err.message || "Could not save location mapping.");
    } finally {
      setSaving(false);
    }
  };

  const isDaraz = platform === "daraz";
  const placeNoun = isDaraz ? "warehouse" : "location";

  if (loading) return null;
  if (!data || !(data.locations || []).length) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <Card>
        <div className="wh-card-table__head" style={{ marginBottom: "0.5rem" }}>
          <div>
            <h3 className="wh-card__title">{isDaraz ? "Daraz warehouses" : "Store locations"}</h3>
            <p className="wh-muted" style={{ margin: "0.35rem 0 0" }}>
              {isDaraz
                ? "Map each Daraz warehouse to an ERP warehouse (and optional POS outlet). Stock push and import use these mappings so inventory lands in the correct place."
                : "Choose which store locations become warehouses and POS outlets in your ERP. Only active Shopify locations are shown (legacy or inactive locations are hidden). Each warehouse can map to only one Shopify location."}
            </p>
          </div>
        </div>

        <div className="wh-mini-row__sub wh-muted" style={{ marginBottom: "0.75rem" }}>
          {capacityText(data.warehouseCapacity, "warehouses")} · {capacityText(data.outletCapacity, "outlets")}
        </div>

        {unmappedCount > 0 && (
          <div className="wh-alert wh-alert--warning" style={{ marginBottom: "0.75rem" }}>
            {unmappedCount} {placeNoun}{unmappedCount === 1 ? "" : "s"} not yet mapped.
          </div>
        )}
        {notice && <p className="wh-form-message" style={{ marginBottom: "0.75rem" }}>{notice}</p>}

        <div className="wh-tx-payments-wrap" style={{ overflow: "auto" }}>
          <table className="wh-tx-payments-table">
            <thead>
              <tr>
                <th>{isDaraz ? "Daraz warehouse" : "Location"}</th>
                <th>Warehouse</th>
                <th>POS outlet</th>
              </tr>
            </thead>
            <tbody>
              {data.locations.map((loc) => (
                <tr key={loc.shopifyLocationId}>
                  <td>
                    <strong>{loc.name}</strong>
                    {loc.shopifyLocationId ? (
                      <div className="wh-muted" style={{ fontSize: "0.85em" }}>
                        Code: {loc.shopifyLocationId}
                      </div>
                    ) : null}
                    {loc.city ? <div className="wh-muted">{loc.city}</div> : null}
                    {!loc.active && <div className="wh-muted">(inactive)</div>}
                  </td>
                  <td>
                    <select
                      className="wh-input"
                      value={choices[loc.shopifyLocationId]?.warehouse ?? SKIP}
                      onChange={(e) => setChoice(loc.shopifyLocationId, "warehouse", e.target.value)}
                    >
                      {warehouseOptions(data.warehouses, data.warehouseCapacity?.canCreate, loc.shopifyLocationId)}
                    </select>
                  </td>
                  <td>
                    <select
                      className="wh-input"
                      value={choices[loc.shopifyLocationId]?.outlet ?? SKIP}
                      onChange={(e) => setChoice(loc.shopifyLocationId, "outlet", e.target.value)}
                    >
                      {targetOptions(data.outlets, data.outletCapacity?.canCreate, "outlet")}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wh-action-btns" style={{ marginTop: "1rem" }}>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isDaraz ? "Save warehouse mapping" : "Save location mapping"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

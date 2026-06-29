import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { usePosReference } from "../../hooks/usePosReference";
import { MODULE_BASE } from "../../constants";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout, FormActions } from "../../../../../../components/FormPageLayout";
import ProductPicker from "../../components/ProductPicker";

const CONFIG = {
  "stock-in": {
    title: "Record Stock In",
    description: "Add stock for one or more products into a store.",
    submitLabel: "Record Stock In",
    apiPath: "/pos/inventory/stock-movements/stock-in/bulk",
    backPath: `${MODULE_BASE}/procurement/stock-in`,
    storeLabel: "Store",
  },
  "stock-out": {
    title: "Record Stock Out",
    description: "Remove stock for one or more products from a store.",
    submitLabel: "Record Stock Out",
    apiPath: "/pos/inventory/stock-movements/stock-out/bulk",
    backPath: `${MODULE_BASE}/procurement/stock-out`,
    storeLabel: "Store",
  },
  transfer: {
    title: "Create Stock Transfer",
    description: "Move stock for one or more products between stores.",
    submitLabel: "Create Transfer",
    apiPath: "/pos/inventory/stock-transfers/bulk",
    backPath: `${MODULE_BASE}/procurement/transfers`,
    storeLabel: null,
  },
};

function resolveOperation(pathname) {
  if (pathname.includes("/stock-out/create")) return "stock-out";
  if (pathname.includes("/transfers/create")) return "transfer";
  return "stock-in";
}

export default function CreateBulkStock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const operation = resolveOperation(pathname);
  const config = CONFIG[operation];
  const { authFetch } = useAuth();
  const { products, outlets } = usePosReference();

  const [selectedIds, setSelectedIds] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [sameQtyForAll, setSameQtyForAll] = useState(true);
  const [sharedQty, setSharedQty] = useState("");
  const [sharedNotes, setSharedNotes] = useState("");
  const [lineDetails, setLineDetails] = useState({});
  const [completeNow, setCompleteNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const storeOptions = useMemo(
    () => outlets.map((o) => ({ value: String(o.id), label: o.outlet_name })),
    [outlets]
  );

  const filteredProducts = useMemo(() => {
    const storeFilter = operation === "transfer" ? fromStoreId : storeId;
    if (!storeFilter) return products;
    return products.filter((p) => String(p.outlet_id) === String(storeFilter));
  }, [products, storeId, fromStoreId, operation]);

  const selectedProducts = useMemo(
    () => filteredProducts.filter((p) => selectedIds.includes(String(p.id))),
    [filteredProducts, selectedIds]
  );

  const toggleProduct = (id) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      if (prev.includes(sid)) {
        setLineDetails((d) => {
          const next = { ...d };
          delete next[sid];
          return next;
        });
        return prev.filter((x) => x !== sid);
      }
      return [...prev, sid];
    });
  };

  const setLine = (id, field, value) => {
    const sid = String(id);
    setLineDetails((d) => ({ ...d, [sid]: { ...d[sid], [field]: value } }));
  };

  const buildPayload = () => {
    const items = selectedIds.map((id) => ({ product_id: Number(id) }));
    const base = {
      same_qty_for_all: sameQtyForAll,
      items,
    };

    if (sameQtyForAll) {
      base.qty = Number(sharedQty);
      base.notes = sharedNotes || null;
    } else {
      base.items = selectedIds.map((id) => ({
        product_id: Number(id),
        qty: Number(lineDetails[id]?.qty || 0),
        notes: lineDetails[id]?.notes || null,
      }));
    }

    if (operation === "transfer") {
      return {
        ...base,
        from_warehouse_id: Number(fromStoreId),
        to_warehouse_id: Number(toStoreId),
        complete: completeNow,
      };
    }

    return { ...base, warehouse_id: Number(storeId) };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedIds.length) {
      setError("Select at least one product");
      return;
    }
    if (operation === "transfer") {
      if (!fromStoreId || !toStoreId) {
        setError("Select source and destination stores");
        return;
      }
      if (fromStoreId === toStoreId) {
        setError("Source and destination must differ");
        return;
      }
    } else if (!storeId) {
      setError("Select a store");
      return;
    }
    if (sameQtyForAll && (!sharedQty || Number(sharedQty) <= 0)) {
      setError("Enter a valid quantity");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await apiFetch(config.apiPath, { method: "POST", body: JSON.stringify(buildPayload()) }, authFetch);
      navigate(config.backPath);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={config.title}
          description={config.description}
          actions={
            <Button variant="secondary" onClick={() => navigate(config.backPath)}>
              Back to history
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="wh-form-stack">
        <FormBlock title="Select products" description="Choose one or more products for this operation.">
          <ProductPicker
            products={filteredProducts}
            selectedIds={selectedIds}
            onToggle={toggleProduct}
            search={productSearch}
            onSearchChange={setProductSearch}
            tall
          />
        </FormBlock>

        <FormBlock
          title="Store"
          description={operation === "transfer" ? "Select source and destination stores." : "Select the store for this stock movement."}
        >
          {operation === "transfer" ? (
            <div className="wh-form-grid">
              <SearchableSelect
                id="from_store"
                label="From store"
                options={storeOptions}
                value={fromStoreId}
                onChange={(v) => {
                  setFromStoreId(v);
                  setSelectedIds([]);
                }}
                placeholder="Source store…"
              />
              <SearchableSelect
                id="to_store"
                label="To store"
                options={storeOptions}
                value={toStoreId}
                onChange={setToStoreId}
                placeholder="Destination store…"
              />
            </div>
          ) : (
            <SearchableSelect
              id="store_id"
              label={config.storeLabel}
              options={storeOptions}
              value={storeId}
              onChange={(v) => {
                setStoreId(v);
                setSelectedIds([]);
              }}
              placeholder="Select store…"
            />
          )}
          {operation === "transfer" && (
            <label className="wh-checkbox-item wh-inv-checkbox-inline">
              <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
              <span>Complete immediately (update stock levels and record movements)</span>
            </label>
          )}
        </FormBlock>

        <FormBlock title="Quantities & notes" description="Set quantities and notes for the selected products.">
          <label className="wh-checkbox-item wh-inv-checkbox-inline">
            <input type="checkbox" checked={sameQtyForAll} onChange={(e) => setSameQtyForAll(e.target.checked)} />
            <span>Same quantity for all</span>
          </label>

          {sameQtyForAll ? (
            <div className="wh-form-grid">
              <FormField id="shared_qty" label="Quantity" type="number" min="1" value={sharedQty} onChange={(e) => setSharedQty(e.target.value)} required />
              <FormField id="shared_notes" label="Notes" value={sharedNotes} onChange={(e) => setSharedNotes(e.target.value)} />
            </div>
          ) : (
            <div className="wh-inv-line-items">
              {selectedProducts.length === 0 ? (
                <p className="wh-muted">Select products above to enter individual quantities.</p>
              ) : (
                selectedProducts.map((p) => (
                  <div key={p.id} className="wh-inv-line-item">
                    <div className="wh-inv-line-item__head">
                      <strong>{p.product_name}</strong>
                      <span className="wh-muted">{p.sku}</span>
                    </div>
                    <div className="wh-form-grid">
                      <FormField
                        id={`qty_${p.id}`}
                        label="Quantity"
                        type="number"
                        min="1"
                        value={lineDetails[String(p.id)]?.qty || ""}
                        onChange={(e) => setLine(p.id, "qty", e.target.value)}
                        required
                      />
                      <FormField
                        id={`notes_${p.id}`}
                        label="Notes"
                        value={lineDetails[String(p.id)]?.notes || ""}
                        onChange={(e) => setLine(p.id, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </FormBlock>

        {error && <p className="wh-field__error">{error}</p>}

        <FormActions>
          <Button type="button" variant="secondary" onClick={() => navigate(config.backPath)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : config.submitLabel}
          </Button>
        </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}

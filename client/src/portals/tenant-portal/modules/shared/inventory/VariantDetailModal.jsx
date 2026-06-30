import { useEffect, useState } from "react";
import { Modal } from "../../../../../components/Modal";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";

export default function VariantDetailModal({
  open,
  row,
  onClose,
  onSave,
  statusOptions = ["active", "inactive"],
  isEdit = false,
  warehouseOptions = [],
  showWarehouseStock = false,
}) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setForm({
      sku: row.sku || "",
      variant_name: row.variant_name || "",
      cost_price: row.cost_price ?? "",
      selling_price: row.selling_price ?? "",
      status: row.status || "active",
      warehouse_stocks: (row.warehouse_stocks || []).map((ws) => ({ ...ws })),
      stock_levels: (row.stock_levels || []).map((sl) => ({ ...sl })),
    });
    setError("");
  }, [open, row]);

  if (!open || !row || !form) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.sku.trim()) {
      setError("SKU is required");
      return;
    }
    if (form.selling_price === "" || Number(form.selling_price) < 0) {
      setError("Valid selling price is required");
      return;
    }
    if (form.cost_price !== "" && Number(form.cost_price) < 0) {
      setError("Cost price cannot be negative");
      return;
    }
    onSave({
      sku: form.sku.trim(),
      variant_name: form.variant_name.trim() || row.variant_name,
      cost_price: form.cost_price,
      selling_price: form.selling_price,
      status: form.status,
      warehouse_stocks: form.warehouse_stocks,
      stock_levels: form.stock_levels,
    });
  };

  const updateWarehouseStock = (whKey, field, value) => {
    setForm((f) => ({
      ...f,
      warehouse_stocks: f.warehouse_stocks.map((ws) =>
        ws._key === whKey ? { ...ws, [field]: value } : ws
      ),
    }));
  };

  const addWarehouseStock = () => {
    const unused = warehouseOptions.find(
      (w) => !form.warehouse_stocks.some((ws) => String(ws.warehouse_id) === String(w.value))
    );
    setForm((f) => ({
      ...f,
      warehouse_stocks: [
        ...f.warehouse_stocks,
        {
          _key: `wh-${Date.now()}`,
          warehouse_id: unused?.value || "",
          initial_qty: "0",
          reserved_qty: "0",
          damaged_qty: "0",
          stock_notes: "",
        },
      ],
    }));
  };

  const attributeEntries = Object.entries(row.combo || {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row.variant_name || "Variant details"}
      className="wh-modal--variant"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="variant-detail-form">
            Save variant
          </Button>
        </>
      }
    >
      <form id="variant-detail-form" onSubmit={handleSubmit} className="wh-form-stack">
        {attributeEntries.length > 0 && (
          <div className="wh-inv-variant-modal__attrs">
            {attributeEntries.map(([name, value]) => (
              <span key={name} className="wh-inv-option-pill">
                {name}: {value}
              </span>
            ))}
          </div>
        )}

        <div className="wh-form-grid">
          <FormField
            id="variant_sku"
            label="SKU"
            value={form.sku}
            onChange={(e) => set("sku", e.target.value)}
            required
          />
          <FormField
            id="variant_status"
            label="Status"
            as="select"
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FormField>
          <FormField
            id="variant_cost"
            label="Cost price (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={(e) => set("cost_price", e.target.value)}
          />
          <FormField
            id="variant_sell"
            label="Selling price (PKR)"
            type="number"
            min="0"
            step="0.01"
            value={form.selling_price}
            onChange={(e) => set("selling_price", e.target.value)}
            required
          />
        </div>

        {showWarehouseStock && !isEdit && warehouseOptions.length > 0 && (
          <div className="wh-inv-variant-modal__stock">
            <div className="wh-inv-line-item__head">
              <strong>Initial stock</strong>
              <Button type="button" variant="secondary" className="wh-btn--sm" onClick={addWarehouseStock}>
                Add location
              </Button>
            </div>
            {form.warehouse_stocks.length === 0 ? (
              <p className="wh-muted">No stock set yet. Add a location or set quantity from the table.</p>
            ) : (
              form.warehouse_stocks.map((ws) => (
                <div key={ws._key} className="wh-form-grid wh-inv-variant-modal__stock-row">
                  <FormField
                    id={`modal_wh_${ws._key}`}
                    label="Location"
                    as="select"
                    value={ws.warehouse_id}
                    onChange={(e) => updateWarehouseStock(ws._key, "warehouse_id", e.target.value)}
                  >
                    <option value="">Select…</option>
                    {warehouseOptions.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </FormField>
                  <FormField
                    id={`modal_iq_${ws._key}`}
                    label="Available"
                    type="number"
                    min="0"
                    value={ws.initial_qty}
                    onChange={(e) => updateWarehouseStock(ws._key, "initial_qty", e.target.value)}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {isEdit && form.stock_levels.length > 0 && (
          <div className="wh-inv-variant-modal__stock">
            <strong>Stock by location</strong>
            {form.stock_levels.map((sl) => (
              <div key={sl.warehouse_id} className="wh-form-grid wh-inv-variant-modal__stock-row">
                <FormField
                  id={`modal_sln_${sl.warehouse_id}`}
                  label="Location"
                  value={sl.warehouse_name || sl.outlet_name}
                  displayOnly
                />
                <FormField
                  id={`modal_sla_${sl.warehouse_id}`}
                  label="Available"
                  value={sl.available_qty ?? 0}
                  displayOnly
                />
                <FormField
                  id={`modal_slr_${sl.warehouse_id}`}
                  label="Reserved"
                  type="number"
                  min="0"
                  value={sl.reserved_qty ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stock_levels: f.stock_levels.map((x) =>
                        x.warehouse_id === sl.warehouse_id
                          ? { ...x, reserved_qty: e.target.value }
                          : x
                      ),
                    }))
                  }
                />
                <FormField
                  id={`modal_sld_${sl.warehouse_id}`}
                  label="Damaged"
                  type="number"
                  min="0"
                  value={sl.damaged_qty ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stock_levels: f.stock_levels.map((x) =>
                        x.warehouse_id === sl.warehouse_id
                          ? { ...x, damaged_qty: e.target.value }
                          : x
                      ),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="wh-field__error">{error}</p>}
      </form>
    </Modal>
  );
}

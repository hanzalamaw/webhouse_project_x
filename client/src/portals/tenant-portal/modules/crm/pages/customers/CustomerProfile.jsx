import { useState, useEffect, useCallback } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../../../../../context/AuthContext";

import { useModulePermission } from "../../../../../../hooks/useModulePermission";

import { apiFetch } from "../../../../../../api/client";

import { PageHeader } from "../../../../../../components/PageHeader";

import { Card } from "../../../../../../components/Card";

import { FormField } from "../../../../../../components/FormField";

import { Button } from "../../../../../../components/Button";

import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";

import { StatusBadge } from "../../../../../../components/Badge";

import { formatDateTime } from "../../../../../../utils/dateTime";

import { formatPKR } from "../../../../../../utils/currency";

import {

  MODULE_BASE,

  CUSTOMER_TYPE_LABELS,

  LEAD_SOURCE_LABELS,

  NOTE_TYPES,

  NOTE_TYPE_LABELS,

  ADDRESS_TYPES,

  ISSUE_TYPE_LABELS,

  ACTIVE_CUSTOMER_DAYS,

} from "../../constants";



function StatCard({ label, value }) {

  return (

    <div className="wh-dash-stat">

      <span className="wh-dash-stat__label">{label}</span>

      <span className="wh-dash-stat__value">{value}</span>

    </div>

  );

}



export default function CustomerProfile() {

  const { customerId } = useParams();

  const { authFetch } = useAuth();

  const { canCreate, canEdit, canDelete } = useModulePermission("crm");

  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const [noteForm, setNoteForm] = useState({ note_type: "note", body: "" });

  const [addrForm, setAddrForm] = useState({

    address_type: "billing",

    address: "",

    city: "",

    state: "",

    postal_code: "",

    is_default: false,

  });

  const [deleteAddr, setDeleteAddr] = useState(null);

  const [saving, setSaving] = useState(false);



  const load = useCallback(async () => {

    setLoading(true);

    setError("");

    try {

      setCustomer(await apiFetch(`/crm/customers/${customerId}`, {}, authFetch));

    } catch (e) {

      setCustomer(null);

      setError(e.message || "Customer not found");

    } finally {

      setLoading(false);

    }

  }, [authFetch, customerId]);



  useEffect(() => { load().catch(() => {}); }, [load]);



  const addNote = async (e) => {

    e.preventDefault();

    if (!canCreate || !noteForm.body.trim()) return;

    setSaving(true);

    setError("");

    try {

      await apiFetch(`/crm/customers/${customerId}/notes`, {

        method: "POST",

        body: JSON.stringify(noteForm),

      }, authFetch);

      setNoteForm({ note_type: "note", body: "" });

      setMessage("Note appended.");

      await load();

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  };



  const addAddress = async (e) => {

    e.preventDefault();

    if (!canEdit) return;

    setSaving(true);

    setError("");

    try {

      await apiFetch(`/crm/customers/${customerId}/addresses`, {

        method: "POST",

        body: JSON.stringify(addrForm),

      }, authFetch);

      setAddrForm({ address_type: "billing", address: "", city: "", state: "", postal_code: "", is_default: false });

      setMessage("Address added.");

      await load();

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  };



  const confirmDeleteAddress = async () => {

    if (!deleteAddr) return;

    setSaving(true);

    try {

      await apiFetch(`/crm/customers/${customerId}/addresses/${deleteAddr.id}`, { method: "DELETE" }, authFetch);

      setDeleteAddr(null);

      setMessage("Address removed.");

      await load();

    } catch (err) {

      setError(err.message);

    } finally {

      setSaving(false);

    }

  };



  if (loading) {

    return (

      <div className="wh-page wh-page--wide">

        <p className="wh-muted">Loading…</p>

      </div>

    );

  }



  if (!customer) {

    return (

      <div className="wh-page wh-page--wide">

        <div className="wh-alert wh-alert--error">{error || "Customer not found"}</div>

        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/manage`)}>Back to customers</Button>

      </div>

    );

  }



  const stats = customer.stats || {};



  return (

    <div className="wh-page wh-page--wide">

      <PageHeader

        title={customer.customer_name}

        description={customer.company_name || "Customer profile"}

        actions={

          <div className="wh-action-btns">

            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/manage`)}>All customers</Button>

            {canEdit && (

              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customers/edit/${customerId}`)}>

                Edit Customer

              </Button>

            )}

            {canCreate && (

              <Button onClick={() => navigate(`${MODULE_BASE}/complaints/create`)}>

                Add Complaint

              </Button>

            )}

          </div>

        }

      />

      {error && <div className="wh-alert wh-alert--error">{error}</div>}

      {message && <div className="wh-alert wh-alert--success">{message}</div>}



      <div className="wh-dash-grid wh-dash-col-3" style={{ marginBottom: 16 }}>

        <StatCard label="Total orders" value={stats.order_count ?? 0} />

        <StatCard label="POS sales" value={stats.pos_sale_count ?? 0} />

        <StatCard label="Lifetime revenue" value={formatPKR(stats.total_revenue ?? 0)} />

        <StatCard label="Open complaints" value={stats.complaint_count ?? 0} />

        <StatCard label="Recent activity" value={stats.recently_active ? `Active (${ACTIVE_CUSTOMER_DAYS}d)` : "Inactive"} />

        <StatCard label="Member since" value={formatDateTime(customer.created_at)} />

      </div>



      <Card>

        <h3 className="wh-card__title">Overview</h3>

        <div className="wh-grid-2">

          <div>

            <span className="wh-muted">Type</span>

            <p>{CUSTOMER_TYPE_LABELS[customer.customer_type] || customer.customer_type}</p>

          </div>

          <div>

            <span className="wh-muted">Status</span>

            <p><StatusBadge status={customer.status} /></p>

          </div>

          <div>

            <span className="wh-muted">Phone</span>

            <p>{customer.phone || "—"}</p>

          </div>

          <div>

            <span className="wh-muted">Email</span>

            <p>{customer.email || "—"}</p>

          </div>

          <div>

            <span className="wh-muted">Tags</span>

            <p>{(customer.tags || []).map((t) => t.tag_name).join(", ") || "—"}</p>

          </div>

          <div>

            <span className="wh-muted">Last updated</span>

            <p>{formatDateTime(customer.updated_at)}</p>

          </div>

          {customer.converted_from_lead && (

            <div style={{ gridColumn: "1 / -1" }}>

              <span className="wh-muted">Converted from lead</span>

              <p>

                {customer.converted_from_lead.lead_name}

                {" · "}

                {LEAD_SOURCE_LABELS[customer.converted_from_lead.source] || customer.converted_from_lead.source}

                {" · "}

                {formatDateTime(customer.converted_from_lead.converted_at)}

              </p>

            </div>

          )}

        </div>

      </Card>



      <div className="wh-dash-grid wh-dash-col-2" style={{ marginTop: 16 }}>

        <Card>

          <h3 className="wh-card__title">Recent orders</h3>

          {(customer.orders || []).length ? (

            <div className="wh-mini-list">

              {customer.orders.map((o) => (

                <div className="wh-mini-row" key={o.id}>

                  <div className="wh-mini-row__main">

                    <div className="wh-mini-row__title">{o.order_no}</div>

                    <div className="wh-mini-row__sub">

                      {o.order_status} · {o.payment_status} · {formatPKR(o.payable_amount)}

                    </div>

                    <div className="wh-mini-row__sub">{formatDateTime(o.created_at)}</div>

                  </div>

                </div>

              ))}

            </div>

          ) : (

            <p className="wh-muted">No orders linked to this customer.</p>

          )}

        </Card>



        <Card>

          <h3 className="wh-card__title">Recent POS sales</h3>

          {(customer.pos_sales || []).length ? (

            <div className="wh-mini-list">

              {customer.pos_sales.map((s) => (

                <div className="wh-mini-row" key={s.id}>

                  <div className="wh-mini-row__main">

                    <div className="wh-mini-row__title">{s.sale_no}</div>

                    <div className="wh-mini-row__sub">{s.payment_status} · {formatPKR(s.payable_amount)}</div>

                    <div className="wh-mini-row__sub">{formatDateTime(s.created_at)}</div>

                  </div>

                </div>

              ))}

            </div>

          ) : (

            <p className="wh-muted">No POS sales linked to this customer.</p>

          )}

        </Card>

      </div>



      <Card style={{ marginTop: 16 }}>

        <h3 className="wh-card__title">Complaints & support</h3>

        {(customer.complaints || []).length ? (

          <div className="wh-mini-list">

            {customer.complaints.map((c) => (

              <div className="wh-mini-row" key={c.id}>

                <div className="wh-mini-row__main">

                  <div className="wh-mini-row__title">{c.subject}</div>

                  <div className="wh-mini-row__sub">

                    {ISSUE_TYPE_LABELS[c.issue_type] || c.issue_type}

                    {" · "}

                    <StatusBadge status={c.status} />

                    {" · "}

                    {c.priority}

                  </div>

                  <div className="wh-mini-row__sub">{formatDateTime(c.created_at)}</div>

                </div>

                {canEdit && (

                  <Button variant="secondary" className="wh-btn--sm" onClick={() => navigate(`${MODULE_BASE}/complaints/edit/${c.id}`)}>

                    Edit

                  </Button>

                )}

              </div>

            ))}

          </div>

        ) : (

          <p className="wh-muted">No complaints recorded.</p>

        )}

      </Card>



      <Card style={{ marginTop: 16 }}>

        <h3 className="wh-card__title">Addresses</h3>

        {(customer.addresses || []).length ? (

          <div className="wh-mini-list">

            {(customer.addresses || []).map((a) => (

              <div className="wh-mini-row" key={a.id}>

                <div className="wh-mini-row__main">

                  <div className="wh-mini-row__title">

                    {a.address_type}{a.is_default ? " (default)" : ""}

                  </div>

                  <div className="wh-mini-row__sub">

                    {a.address}

                    {a.city ? `, ${a.city}` : ""}

                    {a.state ? `, ${a.state}` : ""}

                    {a.postal_code ? ` ${a.postal_code}` : ""}

                  </div>

                </div>

                {canDelete && (

                  <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteAddr(a)}>Delete</Button>

                )}

              </div>

            ))}

          </div>

        ) : (

          <p className="wh-muted">No addresses yet.</p>

        )}

        {canEdit && (

          <form className="wh-form-grid wh-form-grid__actions" onSubmit={addAddress}>

            <FormField id="address_type" label="Type" as="select" value={addrForm.address_type} onChange={(e) => setAddrForm((f) => ({ ...f, address_type: e.target.value }))}>

              {ADDRESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}

            </FormField>

            <FormField id="is_default" label="Default">

              <label>

                <input type="checkbox" checked={addrForm.is_default} onChange={(e) => setAddrForm((f) => ({ ...f, is_default: e.target.checked }))} />

                {" "}Set as default address

              </label>

            </FormField>

            <div className="wh-form-grid__full">

              <FormField id="address" label="Address" as="textarea" rows={2} value={addrForm.address} onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))} />

            </div>

            <FormField id="city" label="City" value={addrForm.city} onChange={(e) => setAddrForm((f) => ({ ...f, city: e.target.value }))} />

            <FormField id="state" label="State" value={addrForm.state} onChange={(e) => setAddrForm((f) => ({ ...f, state: e.target.value }))} />

            <FormField id="postal_code" label="Postal Code" value={addrForm.postal_code} onChange={(e) => setAddrForm((f) => ({ ...f, postal_code: e.target.value }))} />

            <div className="wh-form-grid__full">

              <Button type="submit" disabled={saving}>Add Address</Button>

            </div>

          </form>

        )}

      </Card>



      <Card style={{ marginTop: 16 }}>

        <h3 className="wh-card__title">Notes & remarks</h3>

        {customer.note ? (

          <div className="wh-card__text" style={{ whiteSpace: "pre-wrap" }}>{customer.note}</div>

        ) : (

          <p className="wh-muted">No notes yet.</p>

        )}

        {canCreate && (

          <form className="wh-form-grid wh-form-grid__actions" onSubmit={addNote} style={{ marginTop: 16 }}>

            <FormField id="note_type" label="Type" as="select" value={noteForm.note_type} onChange={(e) => setNoteForm((f) => ({ ...f, note_type: e.target.value }))}>

              {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t] || t}</option>)}

            </FormField>

            <div className="wh-form-grid__full">

              <FormField id="note_body" label="Add note" as="textarea" rows={3} value={noteForm.body} onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))} />

            </div>

            <div className="wh-form-grid__full">

              <Button type="submit" disabled={saving}>Append Note</Button>

            </div>

          </form>

        )}

      </Card>



      <Card style={{ marginTop: 16 }}>

        <h3 className="wh-card__title">Activity timeline</h3>

        {(customer.activities || []).length ? (

          <div className="wh-mini-list">

            {customer.activities.map((a) => (

              <div className="wh-mini-row" key={a.id}>

                <div className="wh-mini-row__main">

                  <div className="wh-mini-row__title">{a.summary}</div>

                  <div className="wh-mini-row__sub">

                    {a.action}{a.user_name ? ` · ${a.user_name}` : ""} · {formatDateTime(a.created_at)}

                  </div>

                </div>

              </div>

            ))}

          </div>

        ) : (

          <p className="wh-muted">No activity recorded yet.</p>

        )}

      </Card>



      <ConfirmDeleteModal

        open={!!deleteAddr}

        title="Delete address"

        recordName={deleteAddr?.address_type || "this address"}

        onConfirm={confirmDeleteAddress}

        onClose={() => setDeleteAddr(null)}

        loading={saving}

      />

    </div>

  );

}



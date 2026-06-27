import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { Button } from "../../../../../components/Button";
import { Card } from "../../../../../components/Card";
import { FormField } from "../../../../../components/FormField";
import { Modal } from "../../../../../components/Modal";
import { formatPKR } from "../../../../../utils/currency";
import { DEVICE_CODE } from "../constants";
import {
  readTerminalSession,
  writeTerminalSession,
  clearTerminalSession,
} from "../terminalSession";
import "../Terminal.css";

function cartTotal(cart) {
  return cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
}

export default function TerminalCheckout() {
  const { authFetch, user, logout } = useAuth();
  const navigate = useNavigate();
  const [deviceCode, setDeviceCode] = useState(DEVICE_CODE);
  const [session, setSession] = useState(() => readTerminalSession());
  const [products, setProducts] = useState([]);
  const [register, setRegister] = useState(null);
  const [terminal, setTerminal] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const restoreSession = useCallback(async (stored) => {
    if (!stored?.terminal_id) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/pos/terminal/${stored.terminal_id}/session`, {}, authFetch);
      setTerminal(res.terminal);
      setRegister(res.register);
      setProducts(res.products || []);
      writeTerminalSession({ terminal_id: res.terminal.id });
    } catch {
      clearTerminalSession();
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (session?.terminal_id) {
      restoreSession(session).catch(() => {});
    }
  }, [session, restoreSession]);

  const connect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError("");
    try {
      const res = await apiFetch("/pos/terminal/connect", {
        method: "POST",
        body: JSON.stringify({ device_code: deviceCode.trim() }),
      }, authFetch);
      setTerminal(res.terminal);
      setRegister(res.register);
      setProducts(res.products || []);
      const stored = { terminal_id: res.terminal.id };
      writeTerminalSession(stored);
      setSession(stored);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category_name || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const addToCart = (product) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.product_name,
          sku: product.sku,
          unit_price: Number(product.selling_price),
          quantity: 1,
        },
      ];
    });
  };

  const changeQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product_id === productId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  };

  const completeSale = async () => {
    if (!terminal || !cart.length) return;
    setCheckoutLoading(true);
    setError("");
    setMessage("");
    try {
      const sale = await apiFetch("/pos/terminal/sales", {
        method: "POST",
        body: JSON.stringify({
          terminal_id: terminal.id,
          items: cart,
        }),
      }, authFetch);
      setCart([]);
      setMessage(`Sale ${sale.sale_no} completed — ${formatPKR(sale.payable_amount)}`);
      const sess = await apiFetch(`/pos/terminal/${terminal.id}/session`, {}, authFetch);
      setRegister(sess.register);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleLogoutChoice = async (shiftOff) => {
    setLogoutLoading(true);
    setError("");
    try {
      if (shiftOff && terminal?.id) {
        await apiFetch(`/pos/terminal/${terminal.id}/shift-off`, { method: "POST" }, authFetch);
        clearTerminalSession();
        setSession(null);
        setTerminal(null);
        setRegister(null);
        setCart([]);
      }
      setLogoutOpen(false);
      await logout();
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoutLoading(false);
    }
  };

  if (!session?.terminal_id || !terminal) {
    return (
      <div className="pos-terminal__gate">
        <div className="pos-terminal__gate-inner">
          <div className="pos-terminal__gate-brand">
            <h1>POS Terminal</h1>
            <p className="wh-muted">
              Pair this device with your store checkout. Products are loaded from Inventory & Procurement.
            </p>
          </div>
          <Card>
            <h2 className="wh-card__title">Enter machine code</h2>
            <p className="wh-muted" style={{ marginBottom: 16 }}>
              Use code <strong>{DEVICE_CODE}</strong> for the default terminal.
            </p>
            {error && <p className="wh-field__error">{error}</p>}
            <form onSubmit={connect} className="wh-form">
              <FormField
                id="device_code"
                label="Machine code"
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value)}
                autoFocus
              />
              <div className="wh-modal__actions" style={{ marginTop: 16, paddingTop: 0 }}>
                <Button type="button" variant="secondary" onClick={() => navigate("/app")}>
                  All modules
                </Button>
                <Button type="submit" disabled={connecting}>
                  {connecting ? "Connecting…" : "Open terminal"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const total = cartTotal(cart);
  const expectedDrawer =
    Number(register?.opening_balance || 0) + Number(register?.cash_collected || 0);

  return (
    <div className="pos-terminal">
      <header className="pos-terminal__topbar">
        <div>
          <div className="pos-terminal__brand">{terminal.terminal_name}</div>
          <div className="pos-terminal__meta">
            <span className="pos-terminal__chip">{terminal.outlet_name}</span>
            <span className="pos-terminal__chip">Cashier: <strong>{user?.name || user?.email}</strong></span>
            <span className="pos-terminal__chip">Opening: <strong>{formatPKR(register?.opening_balance)}</strong></span>
            <span className="pos-terminal__chip">In drawer: <strong>{formatPKR(expectedDrawer)}</strong></span>
          </div>
        </div>
        <div className="pos-terminal__topbar-actions">
          <Button variant="secondary" onClick={() => navigate("/app")}>Modules</Button>
          <Button variant="secondary" onClick={() => setLogoutOpen(true)}>Logout</Button>
        </div>
      </header>

      {(error || message) && (
        <div className="pos-terminal__alerts">
          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
        </div>
      )}

      <div className="pos-terminal__body">
        <section className="pos-terminal__products">
          <div className="pos-terminal__section-head">
            <h2>Products</h2>
            <p className="wh-muted">Tap an item to add it to the current sale.</p>
          </div>
          <div className="pos-terminal__search" style={{ marginBottom: 16 }}>
            <FormField
              id="product_search"
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, SKU or category"
            />
          </div>
          {loading ? (
            <p className="wh-muted">Loading products…</p>
          ) : filteredProducts.length ? (
            <div className="pos-terminal__grid">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pos-product-btn"
                  onClick={() => addToCart(p)}
                >
                  <span className="pos-product-btn__name">{p.product_name}</span>
                  <span className="pos-product-btn__sku">{p.sku}</span>
                  {p.category_name && (
                    <span className="pos-product-btn__cat">{p.category_name}</span>
                  )}
                  <span className="pos-product-btn__price">{formatPKR(p.selling_price)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="pos-terminal__empty">
              <p className="wh-muted">No active products found.</p>
              <p className="wh-muted" style={{ marginTop: 8 }}>
                Add products in{" "}
                <Link to="/app/m/inventory-procurement/products/create" className="wh-link">
                  Inventory & Procurement
                </Link>
                .
              </p>
            </div>
          )}
        </section>

        <aside className="pos-terminal__cart">
          <div className="pos-terminal__cart-head">
            <h2>Current sale</h2>
            <p className="wh-muted" style={{ margin: "4px 0 0", fontSize: "0.8125rem" }}>
              {cart.length ? `${cart.length} line item${cart.length === 1 ? "" : "s"}` : "Empty cart"}
            </p>
          </div>
          <div className="pos-terminal__cart-list">
            {cart.length ? (
              cart.map((line) => (
                <div className="pos-cart-row" key={line.product_id}>
                  <div>
                    <div className="pos-cart-row__name">{line.product_name}</div>
                    <div className="wh-muted" style={{ fontSize: "0.8rem" }}>
                      {formatPKR(line.unit_price)} each
                    </div>
                  </div>
                  <div className="pos-cart-row__controls">
                    <button type="button" className="pos-cart-row__qty-btn" onClick={() => changeQty(line.product_id, -1)}>−</button>
                    <span>{line.quantity}</span>
                    <button type="button" className="pos-cart-row__qty-btn" onClick={() => changeQty(line.product_id, 1)}>+</button>
                  </div>
                </div>
              ))
            ) : (
              <p className="wh-muted">Tap products to add them to the sale.</p>
            )}
          </div>
          <div className="pos-terminal__cart-foot">
            <div className="pos-terminal__total">
              <span>Total</span>
              <span>{formatPKR(total)}</span>
            </div>
            <Button
              type="button"
              disabled={!cart.length || checkoutLoading}
              onClick={completeSale}
              style={{ width: "100%" }}
            >
              {checkoutLoading ? "Processing…" : "Complete sale (cash)"}
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={logoutOpen} onClose={() => !logoutLoading && setLogoutOpen(false)} title="End session">
        <p style={{ marginBottom: 12 }}>
          Are you taking a <strong>break</strong> or is your <strong>shift off</strong>?
        </p>
        <p className="wh-muted" style={{ marginBottom: 16 }}>
          If your shift is off, the cash in this drawer ({formatPKR(expectedDrawer)}) becomes the opening amount for the next shift on this device.
        </p>
        <div className="wh-modal__actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <Button variant="secondary" disabled={logoutLoading} onClick={() => handleLogoutChoice(false)}>
            Taking a break
          </Button>
          <Button disabled={logoutLoading} onClick={() => handleLogoutChoice(true)}>
            Shift is off
          </Button>
        </div>
      </Modal>
    </div>
  );
}

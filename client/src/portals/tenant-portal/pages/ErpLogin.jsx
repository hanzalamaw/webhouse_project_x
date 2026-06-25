import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { API_BASE } from "../../../config/api";
import { FormField } from "../../../components/FormField";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { formatDateTime } from "../../../utils/dateTime";
import "../../wh-portal/pages/Login.css";

const PORTAL_LABELS = { erp1: "ERP 1", erp2: "ERP 2", erp3: "ERP 3" };

export default function ErpLogin({ portal }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user?.portal === "tenant") {
    navigate("/app", { replace: true });
    return null;
  }

  const doLogin = async (forceLogoutOthers = false) => {
    const response = await fetch(`${API_BASE}/tenant/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim(),
        password,
        portal,
        forceLogoutOthers,
      }),
    });
    const data = await response.json();
    if (response.status === 409 && data.code === "SESSION_CONFLICT") {
      setConflict(data.existingSession || {});
      return { conflict: true };
    }
    if (response.ok) {
      login(data.user, data.token, data.refreshToken ?? null);
      navigate("/app");
      return { ok: true };
    }
    setError(data.message || "Invalid credentials");
    return { error: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setConflict(null);
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setIsSubmitting(true);
    try {
      await doLogin(false);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceLogin = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const result = await doLogin(true);
      if (!result?.conflict) setConflict(null);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-form-panel">
        <div className="login-form-content">
          <header className="login-header">
            <h1>{PORTAL_LABELS[portal] || portal}</h1>
            <p>Sign in to your organization workspace.</p>
          </header>
          {error && <div className="login-error">{error}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <FormField id="username" label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            <FormField id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <Button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
        <footer className="login-footer">
          <p>© 2026 WebHouse Inc. All Rights Reserved</p>
        </footer>
      </div>
      <div className="login-image-panel">
        <div className="login-image-frame">
          <img src="/login-image.png" alt="ERP login" />
        </div>
      </div>

      <Modal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
        title="Already signed in elsewhere"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflict(null)}>
              Cancel
            </Button>
            <Button onClick={handleForceLogin} disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Log out other device and continue"}
            </Button>
          </>
        }
      >
        <p>You are already logged in on another device.</p>
        {conflict?.login_at && (
          <p className="wh-muted">Last active: {formatDateTime(conflict.login_at)}</p>
        )}
        {conflict?.ip_address && <p className="wh-muted">IP: {conflict.ip_address}</p>}
        {conflict?.device_info && <p className="wh-muted">Device: {conflict.device_info}</p>}
        <p>Continue here to end the other session.</p>
      </Modal>
    </div>
  );
}

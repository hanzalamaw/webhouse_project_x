import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { API_BASE } from "../../../config/api";
import { FormField } from "../../../components/FormField";
import { Button } from "../../../components/Button";
import "../../wh-portal/pages/Login.css";

const PORTAL_LABELS = { erp1: "ERP 1", erp2: "ERP 2", erp3: "ERP 3" };

export default function ErpLogin({ portal }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user?.portal === "tenant") {
    navigate("/app/dashboard", { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/tenant/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, portal }),
      });
      const data = await response.json();
      if (response.ok) {
        login(data.user, data.token, data.refreshToken ?? null);
        navigate("/app/dashboard");
      } else {
        setError(data.message || "Invalid credentials");
      }
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
    </div>
  );
}

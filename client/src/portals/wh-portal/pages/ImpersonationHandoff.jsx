import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const HANDOFF_PREFIX = "wh_impersonation_handoff_";

export default function ImpersonationHandoff() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const key = searchParams.get("handoff");
    if (!key) {
      setError("Missing impersonation handoff.");
      return;
    }
    const raw = localStorage.getItem(`${HANDOFF_PREFIX}${key}`);
    localStorage.removeItem(`${HANDOFF_PREFIX}${key}`);
    if (!raw) {
      setError("Impersonation session expired or already used.");
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (!data?.token || !data?.user) {
        setError("Invalid impersonation session.");
        return;
      }
      if (Date.now() - (data.ts || 0) > 60_000) {
        setError("Impersonation handoff expired. Try again from the admin portal.");
        return;
      }
      login(data.user, data.token, data.refreshToken ?? null);
      navigate("/app/dashboard", { replace: true });
    } catch {
      setError("Could not start impersonation session.");
    }
  }, [searchParams, login, navigate]);

  return (
    <div className="wh-page" style={{ padding: 24 }}>
      {error ? <p className="wh-field__error">{error}</p> : <p className="wh-muted">Opening tenant portal…</p>}
    </div>
  );
}

export function stashImpersonationHandoff(payload) {
  const key = crypto.randomUUID();
  localStorage.setItem(
    `${HANDOFF_PREFIX}${key}`,
    JSON.stringify({ ...payload, ts: Date.now() })
  );
  return key;
}

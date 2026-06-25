function isLoopback(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip.toLowerCase() === "localhost";
}

function isPrivateIp(ip) {
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const parts = ip.split(".");
  if (parts[0] === "172") {
    const second = Number(parts[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/** Normalize stored IP for display. */
export function formatSessionIp(ip) {
  if (ip == null || ip === "") return "—";
  let value = String(ip).trim();
  if (!value || value === "0.0.0.0") return "—";
  if (value.startsWith("::ffff:")) value = value.slice(7);
  if (isLoopback(value)) return "Localhost";
  if (isPrivateIp(value)) return value;
  return value;
}

/** Short device label from user-agent or legacy device strings. */
export function simplifyDeviceInfo(deviceInfo) {
  if (!deviceInfo) return "—";
  let raw = String(deviceInfo).trim();
  if (!raw) return "—";

  raw = raw.replace(/^impersonation:[^;]+;\s*/i, "").trim() || String(deviceInfo).trim();

  if (!raw.includes("Mozilla") && !raw.includes("(")) {
    return raw.replace(/\s*\/\s*/g, " · ");
  }

  let browser = "Browser";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\//i.test(raw) || /Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw)) browser = "Safari";

  let os = "Unknown";
  if (/Windows/i.test(raw)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/iPhone|iPad/i.test(raw)) os = "iOS";
  else if (/Linux/i.test(raw)) os = "Linux";

  return `${browser} · ${os}`;
}

const STORAGE_KEY = "wh_pos_terminal_session";

export function readTerminalSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeTerminalSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearTerminalSession() {
  localStorage.removeItem(STORAGE_KEY);
}

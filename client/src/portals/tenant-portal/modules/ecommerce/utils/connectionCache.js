/** Session cache so integration tabs show the connected store instantly on revisit. */

export function readCachedConnection(platform) {
  try {
    const raw = sessionStorage.getItem(`wh_${platform}_connection`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.connected ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedConnection(platform, data) {
  try {
    if (data?.connected) {
      sessionStorage.setItem(`wh_${platform}_connection`, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(`wh_${platform}_connection`);
    }
  } catch {
    /* ignore */
  }
}

export function clearCachedConnection(platform) {
  try {
    sessionStorage.removeItem(`wh_${platform}_connection`);
  } catch {
    /* ignore */
  }
}

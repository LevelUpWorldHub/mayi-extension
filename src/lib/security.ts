export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function isAllowedBridgeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith(".web.app") || host.endsWith(".firebaseapp.com");
  } catch {
    return false;
  }
}

export function sameExtension(senderId: string | undefined, runtimeId: string): boolean {
  return Boolean(senderId) && senderId === runtimeId;
}

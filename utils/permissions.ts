// Thin wrappers around chrome.permissions so the welcome page and any
// gated feature can ask for and observe host access. The request API must
// stay synchronously reachable from a user-gesture click — awaiting
// anything before calling it makes Chrome silently reject the prompt.

export type PermissionsRequest = Parameters<
  typeof chrome.permissions.contains
>[0];

export function hasPermissions(perms: PermissionsRequest): Promise<boolean> {
  return chrome.permissions.contains(perms);
}

export function requestPermissions(
  perms: PermissionsRequest,
): Promise<boolean> {
  return chrome.permissions.request(perms);
}

export function watchPermissions(callback: () => void): () => void {
  chrome.permissions.onAdded.addListener(callback);
  chrome.permissions.onRemoved.addListener(callback);
  return () => {
    chrome.permissions.onAdded.removeListener(callback);
    chrome.permissions.onRemoved.removeListener(callback);
  };
}

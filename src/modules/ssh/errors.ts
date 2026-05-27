export function friendlyError(error: unknown): string {
  const msg = String(error);
  if (msg.includes('Authentication failed')) {
    return 'Authentication failed - check the username, password, or key.';
  }
  if (msg.toLowerCase().includes('connection refused')) {
    return 'Connection refused - is the SSH server reachable on that host:port?';
  }
  if (msg.includes('Web SSH proxy is unreachable')) {
    return 'Web SSH proxy is unreachable - start backend/ws-ssh-proxy on port 8080 or set VITE_SSH_BUDDY_WS_PROXY_URL.';
  }
  if (msg.includes('Host key changed')) {
    return msg;
  }
  if (msg.toLowerCase().includes('timeout')) {
    return 'Timeout connecting to host.';
  }
  if (msg.toLowerCase().includes('unreachable')) {
    return 'Host unreachable. Check your network connection and the destination address.';
  }
  return msg;
}

export function categorizeSshError(msg: string): string {
  if (msg.includes('Authentication failed')) return 'auth_failed';
  if (msg.toLowerCase().includes('connection refused')) return 'connection_refused';
  if (msg.includes('Host key changed')) return 'host_key_changed';
  if (msg.includes('proxy is unreachable')) return 'proxy_unreachable';
  if (msg.toLowerCase().includes('timeout')) return 'timeout';
  if (msg.toLowerCase().includes('unreachable')) return 'host_unreachable';
  return 'other';
}

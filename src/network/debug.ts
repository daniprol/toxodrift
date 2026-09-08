/** Load the SDK's own diagnostics before joining so it observes the room lifecycle.
 * Vite removes this import from production builds, including builds in debug mode. */
export async function enableNetworkDebug(): Promise<void> {
  if (
    import.meta.env.DEV &&
    (import.meta.env.MODE === 'debug' || import.meta.env.VITE_NETWORK_DEBUG === '1')
  ) {
    await import('@colyseus/sdk/debug');
    document.documentElement.classList.add('network-debug');
  }
}

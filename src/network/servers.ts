import { z } from 'zod';

export const SavedServerSchema = z
  .object({ name: z.string().min(1).max(64), url: z.string().url() })
  .strict();
export type SavedServer = z.infer<typeof SavedServerSchema>;

export const MultiplayerConfigSchema = z
  .object({
    servers: z.array(SavedServerSchema).max(50),
    localhostPort: z.number().int().min(1).max(65535),
    interpolationMs: z.number().min(0).max(250),
  })
  .strict();
export type MultiplayerConfig = z.infer<typeof MultiplayerConfigSchema>;
const SERVER_KEY = 'toxodrift.servers.v1';
export function normalizeServerUrl(value: string): string {
  const url = new URL(value.includes('://') ? value : `http://${value}`);
  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  }
  if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Enter a server origin such as https://racing.example.com or http://localhost:2567',
    );
  }
  return url.origin;
}
export function savedServers(config: MultiplayerConfig): SavedServer[] {
  let saved: SavedServer[] = [];
  try {
    saved = z
      .array(SavedServerSchema)
      .max(50)
      .parse(JSON.parse(localStorage.getItem(SERVER_KEY) ?? '[]'));
  } catch {
    /* Ignore corrupt browser preferences. */
  }
  const servers = [...config.servers, ...saved];
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    servers.push({ name: 'Localhost', url: `http://localhost:${config.localhostPort}` });
    if (location.port === String(config.localhostPort)) {
      servers.unshift({ name: 'This server', url: location.origin });
    }
  }
  return [
    ...new Map(
      servers.map((server) => {
        const url = normalizeServerUrl(server.url);
        return [url, { ...server, url }];
      }),
    ).values(),
  ];
}
export function saveServer(server: SavedServer, config: MultiplayerConfig): void {
  localStorage.setItem(
    SERVER_KEY,
    JSON.stringify(
      [...savedServers(config).filter((entry) => entry.url !== server.url), server].slice(-50),
    ),
  );
}
export function identityKey(url: string): string {
  return `toxodrift.identity.v1:${url}`;
}

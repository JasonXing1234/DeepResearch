const configuredBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/$/, '') || '';

export function withBasePath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return configuredBasePath ? `${configuredBasePath}${normalizedPath}` : normalizedPath;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`;
  return withBasePath(normalizedPath);
}
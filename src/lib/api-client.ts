const SAGEMAKER_PORT_PATH_RE = /^(\/.*?\/ports\/\d+)(?:\/|$)/;

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function inferBasePathFromLocation(pathname: string) {
  const match = pathname.match(SAGEMAKER_PORT_PATH_RE);
  return match?.[1] ?? '';
}

export function getRuntimeBasePath() {
  const envBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? '');
  if (envBasePath) return envBasePath;

  if (typeof window === 'undefined') {
    return '';
  }

  const nextData = (window as Window & { __NEXT_DATA__?: { assetPrefix?: string } }).__NEXT_DATA__;
  const assetPrefix = normalizeBasePath(nextData?.assetPrefix ?? '');
  if (assetPrefix) return assetPrefix;

  return inferBasePathFromLocation(window.location.pathname);
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getRuntimeBasePath()}${normalizedPath}`;
}

export function apiFetch(input: string, init?: RequestInit) {
  return fetch(buildApiUrl(input), init);
}
const HOSTED_BASE_PATH_RE = /^(\/.*?\/(?:ports|proxy)\/\d+)(?:\/|$)/;
const DEFAULT_SAGEMAKER_BASE_PATH = '/codeeditor/default/ports/3000';

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function inferBasePathFromLocation(pathname: string) {
  const match = pathname.match(HOSTED_BASE_PATH_RE);
  return match?.[1] ?? '';
}

function inferBasePathFromHostname(hostname: string) {
  const normalizedHost = hostname.toLowerCase();
  if (normalizedHost.includes('.studio.') || normalizedHost.endsWith('.sagemaker.aws')) {
    return DEFAULT_SAGEMAKER_BASE_PATH;
  }

  return '';
}

export function getRuntimeBasePath() {
  const envBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? '');
  if (envBasePath) return envBasePath;

  if (typeof window === 'undefined') {
    return '';
  }

  const inferredBasePath = inferBasePathFromLocation(window.location.pathname);
  if (inferredBasePath) return inferredBasePath;

  const nextData = (window as Window & { __NEXT_DATA__?: { assetPrefix?: string } }).__NEXT_DATA__;
  const assetPrefix = normalizeBasePath(nextData?.assetPrefix ?? '');
  if (assetPrefix) return assetPrefix;

  const hostFallback = inferBasePathFromHostname(window.location.hostname);
  if (hostFallback) return hostFallback;

  return '';
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getRuntimeBasePath()}${normalizedPath}`;
}

function buildApiCandidates(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return [path];
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefixedPath = buildApiUrl(normalizedPath);

  if (prefixedPath === normalizedPath) {
    return [normalizedPath];
  }

  return [prefixedPath, normalizedPath];
}

export async function apiFetch(input: string, init?: RequestInit) {
  const candidates = buildApiCandidates(input);

  const first = await fetch(candidates[0], init);
  if (first.status !== 404 || candidates.length === 1) {
    return first;
  }

  return fetch(candidates[1], init);
}
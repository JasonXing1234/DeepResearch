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

function inferBasePathFromNextAssetUrl(assetUrl: string) {
  try {
    const parsed = new URL(assetUrl, window.location.origin);
    const marker = parsed.pathname.indexOf('/_next/');
    if (marker === -1) return '';

    return normalizeBasePath(parsed.pathname.slice(0, marker));
  } catch {
    return '';
  }
}

function inferBasePathFromDocumentAssets() {
  if (typeof document === 'undefined') return '';

  const scriptSrc = Array.from(document.scripts)
    .map((script) => script.src)
    .find((src) => src && src.includes('/_next/'));
  if (scriptSrc) {
    const fromScript = inferBasePathFromNextAssetUrl(scriptSrc);
    if (fromScript) return fromScript;
  }

  const preloadHref = Array.from(document.querySelectorAll('link[rel="preload"], link[rel="modulepreload"]'))
    .map((link) => (link as HTMLLinkElement).href)
    .find((href) => href && href.includes('/_next/'));
  if (preloadHref) {
    const fromPreload = inferBasePathFromNextAssetUrl(preloadHref);
    if (fromPreload) return fromPreload;
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

  const assetDerivedBasePath = inferBasePathFromDocumentAssets();
  if (assetDerivedBasePath) return assetDerivedBasePath;

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
  const candidates: string[] = [];
  const runtimeBasePath = getRuntimeBasePath();

  if (runtimeBasePath) {
    candidates.push(`${runtimeBasePath}${normalizedPath}`);
  }

  // Common hosted IDE proxy forms used by SageMaker Studio and similar environments.
  candidates.push(`/codeeditor/default/ports/3000${normalizedPath}`);
  candidates.push(`/jupyter/default/proxy/3000${normalizedPath}`);

  candidates.push(normalizedPath);

  return Array.from(new Set(candidates));
}

export async function apiFetch(input: string, init?: RequestInit) {
  const candidates = buildApiCandidates(input);

  for (const candidate of candidates) {
    const response = await fetch(candidate, init);
    if (response.status !== 404) {
      return response;
    }
  }

  return fetch(candidates[candidates.length - 1], init);
}
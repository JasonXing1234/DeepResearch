import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/$/, '') || undefined;

const nextConfig: NextConfig = {
	basePath,
	assetPrefix: basePath,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/codeeditor/default/ports/3000",
  // snowflake-sdk ships native/optional dependencies that must not be bundled
  // by webpack/turbopack; keep it as a real Node require in server code.
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
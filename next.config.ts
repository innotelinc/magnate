import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /*
   * Build workers. `next build` sizes its page-data workers to the CPU count it
   * sees, not the memory it has: on a container sharing a busy host this build
   * asked for 7 workers on a 2-core, 768 MiB box and the daemon died with an
   * EOF halfway through collecting page data. Two is what the box can feed;
   * BUILD_CPUS raises or lowers it for a host that knows better.
   */
  experimental: {
    cpus: Number(process.env.BUILD_CPUS) || 2,
  },
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

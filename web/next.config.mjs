/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "500mb" },
  },
  async rewrites() {
    return [
      { source: "/files/:path*", destination: "/api/files/:path*" },
    ];
  },
};

export default nextConfig;

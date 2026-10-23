import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Lets a second dev server (e.g. an agent's) run alongside `npm run dev`
  // without fighting over the .next dev lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typedRoutes: true,
  async redirects() {
    return [
      {
        source: "/shipments",
        destination: "/routes",
        permanent: true,
      },
      {
        source: "/shipments/:shipmentId",
        destination: "/routes/:shipmentId",
        permanent: true,
      },
      // Retired pages: exception review lives as route states and filtered
      // queues; purchase orders live as commercial references on the route.
      {
        source: "/exceptions",
        destination: "/routes",
        permanent: false,
      },
      {
        source: "/purchase-orders",
        destination: "/routes",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

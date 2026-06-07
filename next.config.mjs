/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // All data is fetched server-side from the Apps Script Web App; no images/remote
  // domains needed. Keep the bundle minimal for the Vercel free tier (§6.5).
  poweredByHeader: false,
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  // rotas antigas do Tiger Invest (app instalado no celular, links salvos)
  async redirects() {
    return [
      { source: '/dashboard', destination: '/invest', permanent: true },
      { source: '/dashboard/:path*', destination: '/invest', permanent: true },
    ];
  },
  experimental: { serverComponentsExternalPackages: [] },
};
export default nextConfig;

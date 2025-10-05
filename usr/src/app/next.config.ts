
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // For production, it's crucial to address TypeScript errors.
    ignoreBuildErrors: false,
  },
  eslint: {
    // For production, it's crucial to address ESLint issues.
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      }
    ],
  },
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: ['@react-email/components'],
    // server.fs.allow has been removed to fix 403 Forbidden errors on static assets.
    // No fs.allow needed here for this fix.
  },
};

export default nextConfig;

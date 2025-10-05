
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
    // This allows the Next.js dev server to access files outside the project root,
    // which can be necessary in some cloud development environments.
    serverComponentsExternalPackages: ['sharp', 'onnxruntime-node'],
    serverFilesTraceIncludes: ['/usr/src/app/.next/standalone/src/lib/worker.js'],
  },
};

export default nextConfig;

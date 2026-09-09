import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.PATHWAYS_REVIEW_BUILD_DIR || '.next',
  transpilePackages: ['@pathways/config', '@pathways/imports', '@pathways/shared', '@pathways/ui'],
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/staff/login',
        permanent: false,
      },
      {
        source: '/participants',
        destination: '/beneficiaries',
        permanent: false,
      },
      {
        source: '/imports',
        destination: '/collection/import',
        permanent: false,
      },
    ]
  },
}

export default nextConfig

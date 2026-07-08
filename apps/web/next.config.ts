import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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

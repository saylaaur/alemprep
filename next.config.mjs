import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // lint runs separately via `npm run lint`; skip the duplicate build-time pass
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);

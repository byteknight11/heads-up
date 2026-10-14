/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@heads-up/engine'],
  webpack(config) {
    // Workspace packages import their TypeScript sources with .js extensions.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

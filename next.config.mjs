/** @type {import('next').NextConfig} */
const nextConfig = {
  // whoiser opens raw TCP sockets (net/tls) and must stay a runtime dependency
  // instead of being bundled by Next's server compiler.
  serverExternalPackages: ["whoiser"],
};

export default nextConfig;

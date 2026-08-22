import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  allowedDevOrigins: [
    "9c9b5420-6056-40ee-a652-2f4942460f26-00-1jdr4v0fh4xst.picard.replit.dev",
    "*.picard.replit.dev",
    "*.replit.dev",
    "*.repl.co",
  ],
};

export default nextConfig;

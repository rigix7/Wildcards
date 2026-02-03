/**
 * Polymarket Builder Signing Endpoint
 * 
 * This endpoint provides HMAC signatures using your Builder credentials.
 * The RelayClient calls this endpoint via remoteBuilderConfig to authenticate
 * requests to the Polymarket relayer.
 * 
 * Your Builder credentials stay server-side (secure) while the client can
 * still make authenticated requests.
 */

import type { Express } from "express";
import { buildHmacSignature, type BuilderApiKeyCreds } from "@polymarket/builder-signing-sdk";

// Load Builder credentials from environment variables
const BUILDER_CREDENTIALS: BuilderApiKeyCreds = {
  key: process.env.POLYMARKET_BUILDER_API_KEY || "",
  secret: process.env.POLYMARKET_BUILDER_SECRET || "",
  passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || "",
};

export function registerSigningRoute(app: Express) {
  // Builder signing endpoint for RelayClient remote signing
  app.post("/api/polymarket/sign", async (req, res) => {
    try {
      const { method, path, body } = req.body;
      
      if (!method || !path) {
        return res.status(400).json({ error: "method and path required" });
      }
      
      if (!BUILDER_CREDENTIALS.key || !BUILDER_CREDENTIALS.secret) {
        console.error("[Sign] Builder credentials not configured");
        return res.status(500).json({ error: "Builder credentials not configured" });
      }
      
      const timestamp = Date.now().toString();
      const bodyString = typeof body === "string" ? body : (body ? JSON.stringify(body) : "");
      
      const signature = buildHmacSignature(
        BUILDER_CREDENTIALS.secret,
        parseInt(timestamp),
        method.toUpperCase(),
        path,
        bodyString
      );
      
      console.log(`[Sign] Created HMAC for ${method} ${path}`);
      
      // Return headers for RelayClient to use
      res.json({
        POLY_BUILDER_SIGNATURE: signature,
        POLY_BUILDER_TIMESTAMP: timestamp,
        POLY_BUILDER_API_KEY: BUILDER_CREDENTIALS.key,
        POLY_BUILDER_PASSPHRASE: BUILDER_CREDENTIALS.passphrase,
      });
    } catch (error) {
      console.error("[Sign] Error:", error);
      res.status(500).json({ error: "Signing failed" });
    }
  });

  // Status check endpoint (no sensitive data exposed)
  app.get("/api/polymarket/status", async (req, res) => {
    res.json({
      builderConfigured: !!(BUILDER_CREDENTIALS.key && BUILDER_CREDENTIALS.secret),
      relayerUrl: "https://relayer-v2.polymarket.com",
    });
  });
}

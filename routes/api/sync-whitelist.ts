import { Handlers } from "$fresh/server.ts";
import { syncWhitelist } from "../../lib/whitelist.ts";

export const handler: Handlers = {
  async POST(req) {
    // Optional: Add API key protection
    const authHeader = req.headers.get("Authorization");
    const apiKey = Deno.env.get("SYNC_API_KEY");
    
    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Parse optional addresses from body
      let addressesToCheck: string[] | undefined;
      
      try {
        const body = await req.json();
        if (Array.isArray(body.addresses)) {
          addressesToCheck = body.addresses;
        }
      } catch {
        // No body or invalid JSON - use seed addresses
      }

      const result = await syncWhitelist(addressesToCheck);

      return new Response(JSON.stringify({
        success: true,
        checked: result.checked,
        added: result.added.length,
        removed: result.removed.length,
        addedAddresses: result.added,
        removedAddresses: result.removed,
        errors: result.errors,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: String(error),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};


import type { FastifyRequest, FastifyReply } from "fastify";
import { getSupabaseClient, verify_device_action, verify_device_exists, verify_device_key } from "../utils/db.ts";
import jwt from "jsonwebtoken";

const supabase = getSupabaseClient();

async function verify_jwt(req: FastifyRequest, reply: FastifyReply) {
  console.log("verify_jwt called, Authorization header:", req.headers.authorization ? "present" : "missing");
  
  try {
    const auth = (req.headers.authorization || "").trim();
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      console.log("Missing or invalid Authorization header");
      return reply.status(401).send({ error: "Missing or invalid Authorization header" });
    }
    const token = auth.slice(7).trim();

    // Try to verify with YOUR server JWT secret first (for server-signed tokens)
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
        const user = { id: payload?.sub, email: payload?.email };
        (req as any).user = user;
        return;
      } catch (err) {
        console.log("Server JWT verification failed:", (err as any).message);
      }
    }

    // Last resort: ask Supabase to validate (slow)
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      console.log("Supabase getUser failed:", error?.message);
      return reply.status(401).send({ error: "Invalid token" });
    }
    (req as any).user = data.user;
  } catch (err) {
    console.log("verify_jwt exception:", err);
    return reply.status(401).send({ error: "Unauthorized" });
  }
}



async function verify_exists(req: FastifyRequest, reply: FastifyReply) {
    // try params/query/body first
    let deviceId =
      (req.params as any)?.device_id ||
      (req.query as any)?.device_id ||
      (req.body as any)?.device_id;

    try {
      if (deviceId) {
        const data = await verify_device_exists(deviceId);
      }
    } catch (err) {
      console.log("Error verifying device existence:", err);
      return reply.status(404).send({ error: "Device not found" });
    }

    // try header next
    const apiKey = (req.headers as any)["x-device-key"] as string | undefined;
    try {
      if (!deviceId) {
        const data = await verify_device_key(apiKey || '');
        deviceId = data?.id;
      } 
    } catch (err) {
      console.log("Error verifying device key:", err);
      return reply.status(403).send({ error: "Invalid device key" });
    }

    if (!deviceId) {
      console.log("No device_id provided in request");
      return reply.status(400).send({ error: "No device_id provided" });
    }

    // attach resolved device to request
    (req as any).device = { id: deviceId };
}

async function verify_action(req: FastifyRequest, reply: FastifyReply) {
    await verify_jwt(req, reply);  
    if ((reply as any).sent) return;

    let deviceId =
      (req.params as any)?.device_id ||
      (req.query as any)?.device_id ||
      (req.body as any)?.device_id;

    // If no deviceId, try device API key header
    try {
      if (!deviceId) {
        const apiKey = (req.headers as any)["x-device-key"] as string | undefined;
        console.log("Verifying device key from header:", apiKey ? "present" : "missing");
        apiKey && await verify_device_key(apiKey);
      } 
    } catch (err) {
      return reply.status(403).send({ error: `Invalid device key ${err}`  });
    }

    let userId = (req as any).user?.id || null;

    if (!userId) {
        return reply.status(401).send({ error: "No user information" });
    }

    const deviceData = await verify_device_action(deviceId, userId);
    if (!deviceData) {
        console.log("Device not associated with user:", deviceId, userId);
        return reply.status(403).send({ error: "Device not associated with user" });
    }

    // attach resolved device to request (use db-backed deviceData if available)
    (req as any).device = deviceData;
}

export { verify_jwt, verify_exists, verify_action };
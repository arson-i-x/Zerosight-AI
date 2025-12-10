import type { FastifyRequest, FastifyReply } from "fastify";
import { get_device_credential_from_UUID, getSupabaseClient, verify_device_action } from "../utils/db.ts";
import jwt from "jsonwebtoken";
import { verify_signature } from "../utils/crypto.ts";

const supabase = getSupabaseClient();

async function get_device_credentials(req: FastifyRequest, reply: FastifyReply) {
  // try params/query/body first
  const deviceId = (req.params as any)?.device_id || (req.query as any)?.device_id || (req.body as any)?.device_id;
  // then try headers
  if (deviceId) {
    (req as any).device_id = deviceId;
    try {
      const deviceData = await get_device_credential_from_UUID(deviceId);
      if (!deviceData) {
        throw new Error("No device ID credentials found");
      }
      (req as any).device_credentials = deviceData;
      return reply.status(200).send({ ok: true });
    } catch (err) {
      throw new Error("Error getting device credentials: " + err);
    }
  }
  const device_uuid = (req.headers["x-device-id"] as string) || "";
  if (!device_uuid) {
    throw new Error("No device ID provided");
  }
  const device_credentials = await get_device_credential_from_UUID(device_uuid)
  if (!device_credentials) {
    throw new Error("No device ID credentials found");
  }
  const apiKey = device_credentials.api_key;
  if (!apiKey) {
    throw new Error("No API key found for device");
  }

  const sig = (req.headers["x-signature"] as string) || "";
  const ts = (req.headers["x-ts"] as string) || "";
  const method = req.method || "POST";
  
  const rawBody = req.body && Object.keys(req.body).length > 0
  ? JSON.stringify(req.body)
  : "{}";
  
  if (!verify_signature(method, ts, rawBody, sig, apiKey)) {
    throw new Error("Invalid signature");
  }
  (req as any).device_id = device_uuid;
  (req as any).device_credentials = device_credentials;
}


async function verify_jwt(req: FastifyRequest, reply: FastifyReply) {
  const auth = (req.headers.authorization || "").trim();
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
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
}

async function verify_exists(req: FastifyRequest, reply: FastifyReply) {
    // try device_id to get credentials or fall back to api key
    try {
      console.log("Verifying device credentials via verify_exists");
      await get_device_credentials(req, reply);
    } catch (err) {
      console.log("Error getting device credentials:", err);
    }
}

async function verify_action(req: FastifyRequest, reply: FastifyReply) {
    // first verify JWT to get user
    try {
      await verify_jwt(req, reply);  
    } catch (err) {
      console.log("Error verifying JWT:", err);
      return reply.status(401).send({ error: "Unauthorized" });
    }
    // try device_id to get credentials or fall back to api key
    try {
      await get_device_credentials(req, reply);
    } catch (err) {
      console.log("Error getting device credentials:", err);
      return reply.status(400).send({ error: "Device credentials error" });
    }

    try {
      await verify_device_action((req as any).device_id, (req as any).user.id);
    } catch (err) {
      console.log("Error verifying device action:", err);
      return reply.status(403).send({ error: "Device not authorized for this user" });
    }
}

export { verify_jwt, verify_exists, verify_action };
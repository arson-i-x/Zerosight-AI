import type { FastifyRequest, FastifyReply } from "fastify";
import { get_device_credential_from_api_key, get_device_credential_from_UUID, getSupabaseClient, verify_device_action } from "../utils/db.ts";
import jwt from "jsonwebtoken";

const supabase = getSupabaseClient();

async function get_device_credentials(req: FastifyRequest, deviceId: string) {
  try {
    const deviceData = await get_device_credential_from_UUID(deviceId);
    (req as any).device_credentials = deviceData;
    return deviceData;
  } catch (err) {
    const apiKey = (req.headers as any)["x-device-key"] as string | '';
    try {
      const deviceData = await get_device_credential_from_api_key(apiKey);
      (req as any).device_credentials = deviceData;
      return deviceData;
    } catch (err) {
      console.log("Error verifying device key:", err);
    }
  }
}
  

async function verify_jwt(req: FastifyRequest, reply: FastifyReply) {
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

    // try device_id to get credentials or fall back to api key
    (req as any).device_credentials = await get_device_credentials(req, deviceId);

    (req as any).device_id = (req as any).device_credentials.device_uuid;

    if (!(req as any).device_credentials || !(req as any).device_id) {
      return reply.status(400).send({ error: "No device_id provided" });
    }
}

async function verify_action(req: FastifyRequest, reply: FastifyReply) {
    await verify_jwt(req, reply);  
    if ((reply as any).sent) return;
    // try params/query/body first
    let deviceId =
      (req.params as any)?.device_id ||
      (req.query as any)?.device_id ||
      (req.body as any)?.device_id;
    const userId = (req as any).user.id;

    // try device_id to get credentials or fall back to api key
    (req as any).device_credentials = await get_device_credentials(req, deviceId);

    (req as any).device_id = (req as any).device_credentials.device_uuid;

    if (!(req as any).device_credentials || !(req as any).device_id) {
      return reply.status(400).send({ error: "No device_id provided" });
    }

    try {
      await verify_device_action(deviceId, userId);
    } catch (err) {
      console.log("Error verifying device action:", err);
      return reply.status(403).send({ error: "Device not authorized for this user" });
    }
}

export { verify_jwt, verify_exists, verify_action };
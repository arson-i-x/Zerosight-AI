import type { FastifyRequest, FastifyReply } from "fastify";
import { get_device_credential_from_UUID, getSupabaseClient, verify_device_action } from "../utils/db.ts";
import jwt from "jsonwebtoken";
import { verify_signature } from "../utils/crypto.ts";

const supabase = getSupabaseClient();

async function get_device_credentials(req: FastifyRequest, rep: FastifyReply) {
  // try params/query/body first
  try {
    const deviceId =
      (req.params as any)?.device_id ||
      (req.query as any)?.device_id ||
      (req.body as any)?.device_id;
    const deviceData = await get_device_credential_from_UUID(deviceId);
    (req as any).device_credentials = deviceData;
    return deviceData;
  } catch (err) {
    const sig = (req.headers as any)["x-signature"] || null;
    const uuid = (req.headers as any)["x-device-id"] || null;
    const ts = (req.headers as any)["x-ts"] || null;
    const method = req.method;
    const body = await req.body as any;

    console.log("Verifying device credentials via API key:", { sig, uuid, ts, method });
    
    // timeline check
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 60) throw new Error("Timestamp is too far from current time");

    // rehash request using api key
    try {
      const deviceDataByKey = await get_device_credential_from_UUID(uuid);
      const apiKey = deviceDataByKey.api_key;
      console.log("apiKey:", `"${apiKey}"`, apiKey.length);
      
      // compare signatures
      if (!verify_signature(method, ts, body, sig, apiKey)) {
        return rep.status(400).send({ error: "Invalid signature" });
      }

      // attach device credentials
      (req as any).device_credentials = deviceDataByKey;
    } catch (err) {
      throw err;
    }
    if (!sig) {
      throw new Error("No API signature provided");
    }
    if (!uuid) {
      throw new Error("No device UUID provided");
    }
    if (!ts) {
      throw new Error("No timestamp provided");
    }
    if (!method) {
      throw new Error("No method provided");
    }

    (req as any).device_id = (req as any).device_credentials.device_uuid;

    if (!(req as any).device_credentials || !(req as any).device_id) {
      return rep.status(400).send({ error: "No device_id provided" });
    }

  }
}

async function verify_jwt(req: FastifyRequest, reply: FastifyReply) {
  try {
    const auth = (req.headers.authorization || "").trim();
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      console.log("Missing or invalid Authorization header");
      reply.status(401).send({ error: "Missing or invalid Authorization header" });
      throw new Error("Unauthorized");
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
      reply.status(401).send({ error: "Invalid token" });
      throw new Error("Unauthorized");
    }
    (req as any).user = data.user;
  } catch (err) {
    console.log("verify_jwt exception:", err);
    reply.status(401).send({ error: "Unauthorized" });
    throw err;
  }
}

async function verify_exists(req: FastifyRequest, reply: FastifyReply) {
    // try device_id to get credentials or fall back to api key
    try {
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
      return reply.status(400).send({ error: "No device_id provided" });
    }

    try {
      await verify_device_action((req as any).device_id, (req as any).user.id);
    } catch (err) {
      console.log("Error verifying device action:", err);
      return reply.status(403).send({ error: "Device not authorized for this user" });
    }
}

export { verify_jwt, verify_exists, verify_action };
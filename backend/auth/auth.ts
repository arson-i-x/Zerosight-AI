import type { FastifyRequest, FastifyReply } from "fastify";
import { get_device_credential_from_UUID, getSupabaseClient, verify_device_action } from "../utils/db.ts";
import { verify_signature } from "../utils/crypto.ts";
import jwt from "jsonwebtoken";

const supabase = getSupabaseClient();

const JWT_Secret = process.env.JWT_SECRET || "";

async function get_device_credentials_from_headers(req: FastifyRequest, reply: FastifyReply) {
  // fall back to headers with signature verification
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

async function get_jwt_from_headers(req: FastifyRequest, reply: FastifyReply) {
  const auth = (req.headers.authorization || "").trim();
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new Error("No authorization token provided");
  }
  const token = auth.slice(7).trim();
 
  // verify server JWT token
  if (JWT_Secret) {
    try {
      const payload = jwt.verify(token, JWT_Secret) as any;
      (req as any).user = { id: payload.sub, provider: payload.provider };
      return;
    } catch (err) {
      throw new Error("JWT verification failed: " + (err as any).message);
    }
  } else {
    throw new Error("Server misconfiguration: missing SUPABASE_JWT_SECRET");
  }
}

async function verify_jwt(req: FastifyRequest, reply: FastifyReply) {
  try {
    await get_jwt_from_headers(req, reply);
  } catch (err) {
    return reply.status(401).send({ error: "Error verifying JWT: " + (err as any).message });
  }
}

async function verify_exists(req: FastifyRequest, reply: FastifyReply) {
  // attach JWT user if possible
  try {
    await get_jwt_from_headers(req, reply);
  } catch (err) {
    console.log("No valid JWT found in verify_exists:", (err as any).message);
  }

  // verify device credentials
  try {
    console.log("Verifying device credentials via verify_exists");
    await get_device_credentials_from_headers(req, reply);
  } catch (err) {
    return reply.status(401).send({ error: "Error verifying device: " + (err as any).message });
  }
}

export { verify_jwt, verify_exists };
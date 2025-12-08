import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import auth_plugin from "./auth/authPlugin.ts"; // import the plugin
import events_plugin from "./API/events.ts"; // import the plugin
import devices_plugin from "./API/devices.ts";
import helmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import 'dotenv/config';
import faces_plugin from "./API/faces.ts";

const app = Fastify({ logger: true });

const allowedOrigins = [
  process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000",
  process.env.NEXT_PUBLIC_DEVICE_URL || "http://localhost:5000", 
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
].filter(Boolean);

// strict CORS: only allow configured origins
await app.register(fastifyCors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, false); // allow non-browser requests
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-Key"],
});

// cookies (for refresh token)
await app.register(fastifyCookie, { secret: process.env.COOKIE_SECRET || "default-secret" });

// basic security headers + rate limit
await app.register(helmet);
await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Register the auth routes
await app.register(auth_plugin, { prefix: "/auth" });
  
// Register other plugins/routes here (e.g., eventsPlugin)
await app.register(events_plugin, { prefix: "/API" });
await app.register(devices_plugin, { prefix: "/API" });
await app.register(faces_plugin, { prefix: "/API" });

console.log("Routes:\n", app.printRoutes());

// -------------------------
// HEALTH CHECK
// -------------------------
app.get("/", async () => ({ status: "online" }));

// Start
try {
  await app.listen({ port: 8000 });
  console.log("Backend running on port 8000");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

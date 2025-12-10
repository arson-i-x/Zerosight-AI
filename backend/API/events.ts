// events.ts
import { verify_exists, verify_jwt } from "../auth/auth.ts";
import { add_event, fetch_events } from "../utils/db.ts";
import type { FastifyPluginAsync } from "fastify";

const events_plugin: FastifyPluginAsync = async (fastify, opts) => {
    // Devices send events here
    fastify.post("/events/add_event", { preHandler: verify_exists }, async (req, reply) => {
        const device_uuid = (req as any).device_id;
        const { event_type, created_at, details } = req.body as any;
        console.log("Received event:", { device_uuid, event_type, created_at, details });
        if (!event_type || !created_at) {
            return reply.status(400).send({ error: "Missing event_type or created_at" });
        }

        try {
            await add_event(device_uuid, event_type, created_at, details);
        } catch (error :any) {
            return reply.status(500).send({ error: `Failed to add event: ${error.message}` });
        }
        return reply.send({ status: "event added" });
    });

    // Get events for a device
    fastify.get("/devices/events/:device_id", { preHandler: verify_jwt }, async (req, reply) => {
        const device_id = (req.params as any).device_id;
        
        if (!device_id) {
            return reply.status(400).send({ error: "No device_id provided" });
        }

        try {
            const events = await fetch_events(device_id);
            console.log("Events fetched:", events);
            return reply.send({ events });
        } catch (error) {
            return reply.status(500).send({ error: `Failed to fetch events: ${error}` });
        }
    });
};

export default events_plugin;
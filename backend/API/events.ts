// events.ts
import { verify_action, verify_jwt } from "../auth/auth.ts";
import { add_event, fetch_events } from "../utils/db.ts";
import type { FastifyPluginAsync } from "fastify";

const events_plugin: FastifyPluginAsync = async (fastify, opts) => {
    // Devices send events here
    fastify.post("/events/add_event", { preHandler: verify_action }, async (req, reply) => {
        const device = (req as any).device;
        const user_id = device.user_id;
        const device_id = device.id;
        const { event_type, timestamp, details } = req.body as any;

        if (!user_id) {
            return reply.status(400).send({ error: "Device not claimed by user yet" });
        }
        if (!event_type || !timestamp) {
            return reply.status(400).send({ error: "Missing event_type or timestamp" });
        }

        try {
            await add_event(device_id, user_id, event_type, timestamp, details);
        } catch (error) {
            return reply.status(500).send({ error: `Failed to add event: ${error}` });
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
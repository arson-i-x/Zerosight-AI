// Device plugin
import { get_user_devices, add_device, remove_device } from "../utils/db.ts";
import { verify_exists, verify_jwt } from "../auth/auth.ts";

const devices_plugin = async (fastify: any, opts: any) => {
    // Get all devices for a user
    fastify.get("/devices/user_devices", { preHandler: verify_jwt }, async (request: any, reply: any) => {
        const userId = (request as any).user.id || null;
        console.log("User ID in request:", userId);
        if (!userId) {
            return reply.status(400).send({ error: "No user information" });
        }
        
        try {
            const devices = await get_user_devices(userId);
            console.log("Devices fetched for user:", devices);
            return reply.send({ devices });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to fetch devices" });
        }
    });

    fastify.post("/devices/add_device", { preHandler: verify_jwt }, async (request: any, reply: any) => {
        const userId = (request as any).user.id;
        if (!userId) {
            return reply.status(400).send({ error: "No user information" });
        }
        const { deviceId, deviceName } = request.body;
        if (!deviceId || !deviceName) {
            return reply.status(400).send({ error: "Missing deviceId or deviceName" });
        }
        try {
            const device = await add_device(userId, deviceId, deviceName);
            return reply.send({ device });
        } catch (error) {
            fastify.log.error({ err: error }, "Add device error");
            return reply.status(500).send({ error: "Failed to add device" });
        }
    });

    // Remove a device for a user
    fastify.delete("/devices/remove_device", { preHandler: verify_jwt }, async (request: any, reply: any) => {
        const userId = (request as any).user.id;
        if (!userId) {
            return reply.status(400).send({ error: "No user information" });
        }
        const deviceId = (request as any).device_id;
        if (!deviceId) {
            return reply.status(400).send({ error: "No device ID provided" });
        }
        try {
            const result = await remove_device(deviceId, userId);
            return reply.send({ result });
        } catch (error) {
            fastify.log.error({ err: error }, "Remove device error");
            return reply.status(500).send({ error: "Failed to remove device" });
        }
    });

    fastify.post("/devices/register", { preHandler: verify_exists }, async (request: any, reply: any) => {
        return reply.send({ ok: true, device_id: (request as any).device_id });
    });

    fastify.get("/devices/info", { preHandler: verify_exists }, async (request: any, reply: any) => {
        return reply.send({ ok: true, device_credentials: (request as any).device_credentials });
    });
};
export default devices_plugin;
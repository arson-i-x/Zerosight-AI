// Device plugin
import { get_user_devices, add_device, remove_device, get_device_credential_from_UUID } from "../utils/db.ts";
import { verify_exists, verify_action, verify_jwt } from "../auth/auth.ts";
import { verify } from "crypto";

const devices_plugin = async (fastify: any, opts: any) => {
    // Get all devices for a user
    fastify.get("/devices/user_devices", { preHandler: verify_jwt }, async (request: any, reply: any) => {
        try {
            const userId = (request as any).user.id || null;
            console.log("User ID in request:", userId);
            if (!userId) {
                return reply.status(400).send({ error: "No user information" });
            }
            const devices = await get_user_devices(userId);
            return reply.send({ devices });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to fetch devices" });
        }
    });

    // Add a new device for a user
    fastify.post("/devices/add_device", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            // try to get userId from JWT
            const userId = (request as any).body.user_id || null;

            const deviceName = (request as any).body.device_name;

            if (!deviceName || deviceName.trim() === "" || deviceName.length > 100 ) {
                return reply.status(400).send({ error: "Invalid device name" });
            }

            let deviceId = (request as any).device_id;

            const device_credential_id = (request as any).device_credentials?.id;

            if (!deviceName || !deviceId || !device_credential_id) {
                return reply.status(400).send({ error: "Missing deviceId, deviceName, or device_credential_id" });
            }
            if (!userId) {
                return reply.status(400).send({ error: "No user information" });
            }
            try {
                await add_device(userId, deviceId, deviceName, device_credential_id);
            } catch (e: any) {
                return reply.status(500).send({ error: "Failed to add device: " + e.message });
            }
            fastify.log.info(`Device ${deviceId} added for user ${userId}`);
            return reply.status(200).send({ status: " device added " });
        } catch (error) {
            fastify.log.error({ err: error }, "Add device error");
            return reply.status(500).send({ error: "Failed to add device " + error });
        }
    });

    // Remove a device for a user
    fastify.delete("/devices/remove_device", { preHandler: verify_action }, async (request: any, reply: any) => {
        try {
            const userId = (request as any).user.id;
            const deviceId = (request as any).device_id;
            const result = await remove_device(deviceId, userId);
            return reply.send({ result });
        } catch (error) {
            fastify.log.error({ err: error }, "Remove device error");
            return reply.status(500).send({ error: "Failed to remove device" });
        }
    });

    fastify.post("/devices/register", { preHandler: verify_exists }, async (request: any, reply: any) => {
        const device_id = (request as any).device_id ?? null;
        console.log("Registering device ID:", device_id);
        if (!device_id) {
            fastify.log.error({ err: "Missing device_id" }, "Device registration error");
            return reply.status(400).send({ error: "device_id required" });
        }
        // Device is valid and registered
        return reply.send({ ok: true, device_id: device_id });
    });

    fastify.get("/devices/info", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            const device_id = (request as any).device_id ?? null;
            const deviceInfo = await get_device_credential_from_UUID(device_id);
            if (!deviceInfo) {
                return reply.status(404).send({ error: "Device not found" });
            }
            return reply.send({ device: deviceInfo });
        } catch (error) {
            fastify.log.error({ err: error }, "Get device info error");
            return reply.status(500).send({ error: "Failed to get device info" });
        }
    });
};
export default devices_plugin;
// Device plugin
import { get_user_devices, add_device, remove_device } from "../utils/db.ts";
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
    fastify.post("/devices/add_device", { preHandler: verify_action }, async (request: any, reply: any) => {
        try {
            const userId = (request as any).user?.id ?? null;
            let deviceId = (request as any).device?.id ?? null; 
            const deviceName = (request as any).body.device_name;
            if (!deviceId) {
                deviceId = (request as any).body.device_id;
            }
            if (!deviceName || !deviceId) {
                return reply.status(400).send({ error: "Missing deviceId or deviceName" });
            }
            console.log("Adding device:", deviceId, "for user:", userId);
            if (!userId) {
                return reply.status(400).send({ error: "No user information" });
            }
            try {
                await add_device(userId, deviceId, deviceName);
            } catch (e: any) {
                return reply.status(500).send({ error: "Failed to add device: " + e.message });
            }
            
            return reply.status(200).send({ status: "device added " });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to add device " + error });
        }
    });

    // Remove a device for a user
    fastify.delete("/devices/remove_device", { preHandler: verify_action }, async (request: any, reply: any) => {
        try {
            const userId = (request as any).user.id;
            const { deviceId } = (request as any).device.id;
            const result = await remove_device(deviceId, userId);
            return reply.send({ result });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to remove device" });
        }
    });

    fastify.post("/devices/register", { preHandler: verify_exists }, async (request: any, reply: any) => {
        const device  = (request as any).device;
        const device_id = device?.id ?? null;
        
        if (!device_id) {
            fastify.log.error({ err: "Missing device_id" }, "Device registration error");
            return reply.status(400).send({ error: "device_id required" });
        }
        // Device is valid and registered
        return reply.send({ ok: true, device_id: device.id });
    });

    fastify.get("/devices/info", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            const deviceData = (request as any).device;
            return reply.send({ device: deviceData });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to get device info" });
        }
    });
};
export default devices_plugin;
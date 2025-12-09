// Face encoding related enpoints
import { add_face_encoding, delete_all_face_encodings, get_face_encodings } from "../utils/db.ts";
import { verify_exists } from "../auth/auth.ts";

const faces_plugin = async (fastify: any, opts: any) => {

    // Get all face encodings for a user
    fastify.get("/faces/get_face_encodings", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            const deviceId = (request as any).device_id;
            const faceEncodings = await get_face_encodings(deviceId);
            return reply.send({ faceEncodings });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to get face encodings" });
        }
    });

    fastify.get("/faces/health", async (request: any, reply: any) => {
        return reply.send({ status: "faces plugin is healthy" });
    });

    fastify.delete("/faces/delete_all_face_encodings", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            const userId = (request as any).user.id;
            const result = await delete_all_face_encodings(userId);
            return reply.send({ result });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to delete face encodings" });
        }
    });

    fastify.post("/faces/add_face_encoding", { preHandler: verify_exists }, async (request: any, reply: any) => {
        try {
            const { name, face } = request.body;
            const deviceId = (request as any).device_id;
            const faceEncoding = await add_face_encoding(deviceId, name, face);
            return reply.send({ faceEncoding });
        } catch (error) {
            return reply.status(500).send({ error: "Failed to add face encoding" + error });
        }
    });
};

export default faces_plugin;
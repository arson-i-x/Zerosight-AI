import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

// Incoming event from device
router.post("/event", async (req, res) => {
  const { deviceId, eventType, metadata } = req.body;

  const { error } = await supabase
    .from("events")
    .insert({ device_id: deviceId, event_type: eventType, metadata });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to save event" });
  }

  res.json({ success: true });
});

export default router;

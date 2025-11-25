import express from "express";
import sensorRoutes from "./routes/sensor.js";

const app = express();
app.use(express.json());

// IoT endpoints
app.use("/api/sensor", sensorRoutes);

app.listen(3000, () => console.log("Server started on port 3000"));

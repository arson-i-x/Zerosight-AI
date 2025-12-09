# video recognizer.py
# Raspberry Pi/Windows video recognizer using camera input.
# -----------------------------------------------------------
import argparse
import pickle
import face_recognition
import cv2
import numpy as np
import datetime
import time
import sys
print(sys.executable)

def prepare_frame(frame):
    if frame is None:
        raise ValueError("Frame is None")
    # Remove alpha if present
    if frame.ndim == 3 and frame.shape[2] == 4:
        frame = frame[:, :, :3]
    # Convert BGR -> RGB
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    # Ensure dtype and contiguous memory
    rgb = np.ascontiguousarray(rgb, dtype=np.uint8)
    return rgb

class VideoRecognizer:
    """Recognizes video input from a camera device."""

    def __init__(self, faces, device_index=None, device_name=None, callback=None):
        self.device_index = device_index
        self.device_name = device_name
        self.callback = callback
        self.faces = faces  # Loaded face encodings

    def run(self):
        """Start the video recognition loop."""
        cap = cv2.VideoCapture(self.device_index if self.device_index is not None else 0)

        if not cap.isOpened():
            print("Error: Could not open video device.")
            return

        print("Video recognizer started. Press 'q' to quit.")

        frame_count = 0
        DETECT_EVERY_N_FRAMES = 1  # Change this value as needed

        while True:
            ret, frame = cap.read()
            if not ret:
                print("Error: Could not read frame.")
                break
            frame_count += 1
            # Face recognition and anomaly detection
            if (frame_count % DETECT_EVERY_N_FRAMES == 0 and self.anomalyDetected(frame)):  # Replace with actual detection logic
                detection = {
                    "type": "video",
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "details": "Unknown face detected in video frame.",
                    "frame": frame  # You can process or save the frame as needed
                }
                if self.callback:
                    self.callback(detection)

            cv2.imshow('Video Feed', frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

    def anomalyDetected(self, frame):
        # Downsample for faster processing
        DOWNSCALE = 0.25  # 0.5 = half size, adjust as needed
        small_frame = cv2.resize(frame, (0, 0), fx=DOWNSCALE, fy=DOWNSCALE)
        rgb_small = prepare_frame(small_frame)

        locations = face_recognition.face_locations(rgb_small)
        if not locations or len(locations) == 0:
            return False

        try:
            encodings = face_recognition.face_encodings(rgb_small, locations)
            if not encodings or len(encodings) != len(locations):
                print(f"Warning: Got {len(encodings)} encodings for {len(locations)} locations, skipping frame.")
                return False
        except Exception as e:
            print(f"Error in face encoding: {e}")
            print(f"Locations: {locations}")
            print(f"Frame dtype: {rgb_small.dtype}, shape: {rgb_small.shape}")
            return False

        anomaly = False

        # Scale locations back to original frame size
        for (top, right, bottom, left), enc in zip(locations, encodings):
            top = int(top / DOWNSCALE)
            right = int(right / DOWNSCALE)
            bottom = int(bottom / DOWNSCALE)
            left = int(left / DOWNSCALE)

            distances = [np.linalg.norm(enc - k["encoding"]) for k in self.faces]
            if len(distances) > 0:
                idx = np.argmin(distances)
                best_distance = distances[idx]
            else:
                best_distance = 999

            if best_distance < 0.75:
                name = self.faces[idx]["name"]
            else:
                name = "Unknown"
                anomaly = True

            cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
            cv2.putText(frame, name, (left, top - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        return anomaly


def _build_arg_parser():
    parser = argparse.ArgumentParser(description="Listen for sound events from a microphone input.")
    parser.add_argument("--device-index", type=int, help="Use this input device index directly.")
    parser.add_argument("--device-name", help="Preferred name substring to match (e.g., Logitech).")
    parser.add_argument("--list-devices", action="store_true", help="Show plugged-in microphones and exit.")
    return parser

def list_video_devices():
    """Print the list of available video input devices."""
    index = 0
    arr = []
    while True:
        cap = cv2.VideoCapture(index)
        read = cap.read()[0]
        if not read:
            break
        else:
            arr.append(index)
        cap.release()
        index += 1
    print("Available video input devices:", arr)
    return arr

# Example usage:
if __name__ == "__main__":
    parser = _build_arg_parser()
    args = parser.parse_args()
    if args.list_devices:
        list_video_devices()
        exit()

    elif args.device_index is not None:
        device_index = args.device_index
    else:
        device_index = 0  # Default to first camera
        recognizer = VideoRecognizer(device_index=0)
        recognizer.run()
    
    try:
        recognizer.run()
    except KeyboardInterrupt:
        print("\nStopping listener...")


import datetime
import os
import time
import cv2
import requests
import face_recognition
import time
import numpy as np
import json
import hashlib
import hmac

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000/API/")
EVENT_COOLDOWN_SEC = float(os.environ.get("EVENT_COOLDOWN_SEC", "1.0"))

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

class EventSender:
    """Throttles detection events and forwards them to the backend using device API key."""

    def __init__(self, device_id, api_key, video_device_index=None, audio_device_index=None, cooldown=EVENT_COOLDOWN_SEC):
        self.backend_url = BACKEND_URL
        self.device_id = device_id
        self.api_key = api_key
        self.cooldown = max(cooldown, 0.2)
        self._last_sent = 0.0
        self.video_device_index = video_device_index
        self.audio_device_index = audio_device_index

    def sign_request(self, method, body_json, ts, secret):
        msg = f"{method}\n{ts}\n{body_json}"
        return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()

    def send_request(self, url, event, device_id, device_secret, request_method="POST"):
        url = BACKEND_URL + url
        ts = str(int(time.time()))
        body_json = json.dumps(event, separators=(',', ':'))
        sig = self.sign_request(request_method, body_json, ts, device_secret)
        headers = {
            "Content-Type": "application/json",
            "Connection": "close",
            "x-device-id": device_id,
            "x-ts": ts,
            "x-signature": sig,
        }
        with requests.Session() as s:
            s.headers.update(headers)
        if request_method == "GET":
            r = s.get(url, headers=headers, timeout=10, stream=False)
        elif request_method == "POST":
            r = s.post(url, headers=headers, data=body_json, timeout=10, stream=False)
        elif request_method == "DELETE":
            r = s.delete(url, headers=headers, timeout=10, stream=False)
        elif request_method == "PUT":
            r = s.put(url, headers=headers, data=body_json, timeout=10, stream=False)
        else:
            raise ValueError(f"Unsupported request method: {request_method}")
        # print(f"Sent {request_method} request to {url}, status code: {r.status_code}. Response: {r.text}")
        return r

    def sendAudioEvent(self, detection):
        now = time.time()
        if now - self._last_sent < self.cooldown:
            return
        self._last_sent = now

        created_at = detection.get("created_at", now)

        payload = {
            "event_type": "audio_trigger",
            "created_at": created_at,
            "details": {
                "description": detection["label"],
                "energy": detection["energy"],
                "spectral_centroid": detection["centroid"],
            },
        }

        try:
            response = self.send_request(
                url="events/add_event",
                event=payload,
                device_id=self.device_id,
                device_secret=self.api_key,
                request_method="POST"
            )
        except requests.RequestException as exc:
            raise Exception(f"Failed to send event: {exc}")

        if response.status_code >= 400:
            raise Exception(f"Backend error {response.status_code}: {response.text}")
        else:
            timestamp_str = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp_str}] Event forwarded: {payload['details']['description']}")

    def sendVideoEvent(self, detection):
        now = time.time()
        if now - self._last_sent < self.cooldown:
            return
        self._last_sent = now

        created_at = detection.get("created_at", now)

        payload = {
            "event_type": "video_trigger",
            "created_at": created_at,
            "details": detection.get("details", {}),
        }

        try:
            response = self.send_request(
                url="events/add_event",
                event=payload,
                device_id=self.device_id,
                device_secret=self.api_key,
                request_method="POST"
            )
        except requests.RequestException as exc:
            raise Exception(f"Failed to send event: {exc}")

        if response.status_code >= 400:
            raise Exception(f"Backend error {response.status_code}: {response.text}")
        else:
            timestamp_str = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp_str}] Event forwarded: video_trigger")

    def addNewFace(self, name):
        
        now = time.time()
        if now - self._last_sent < self.cooldown:
            return
        self._last_sent = now

        # make sure name isn't invalid
        name = name.strip()
        if not name:
            raise Exception("Name cannot be empty or whitespace.")
        # make sure name isn't too long
        if len(name) > 100:
            raise Exception("Name too long; max 100 characters.")
        
        # get existing faces
        known_faces = self.getFaces()

        # make sure name isn't already taken
        matches = [f["name"].lower() == name.lower() for f in known_faces]
        if any(matches):
            raise Exception("Name already taken.")
        
        # capture new face
        try: 
            face = self.capture_new_face()
        except Exception as e:
            raise Exception(f"Failed to capture new face: {e}")
        if face is None:
            raise Exception("No face captured.")

        # make sure face encoding is valid
        if face is None or len(face) == 0:
            raise Exception("Invalid face encoding.")
        
        # make sure face is not already registered, if so return early
        try:
            matches = face_recognition.compare_faces(
                [kf["encoding"] for kf in known_faces], face, tolerance=0.4)
            if any(matches):
                return known_faces
        except Exception as e:
            raise Exception(f"Error comparing faces: {e}")
        
        known_faces.append({"name": name, "encoding": face})    

        # send to backend
        payload = {
            "face": face.tolist(),
            "name": name,
        }
        try:
            print("Sending new face to backend...")
            response = self.send_request(
                url="faces/add_face_encoding",
                event=payload,
                device_id=self.device_id,
                device_secret=self.api_key,
                request_method="POST"
            )
        except requests.RequestException as exc:
            raise Exception(f"Failed to send event: {exc}")

        if response.status_code >= 400:
            raise Exception(f"Backend error {response.status_code}: {response.text}")
        else:
            timestamp_str = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp_str}] New face added: {name}")
            return known_faces

    def getFaces(self):
        try:
            print("Fetching known faces from backend...")
            response = self.send_request(
                url="faces/get_face_encodings",
                event={},
                device_id=self.device_id,
                device_secret=self.api_key,
                request_method="GET"
            )
        except requests.RequestException as exc:
            raise Exception(f"Failed to get face encodings: {exc}")

        if response.status_code >= 400:
            raise Exception(f"Backend error {response.status_code}: {response.text}")
        return response.json().get("faceEncodings", [])
    
    def clearFaces(self):
        try:
            response = self.send_request(
                url="faces/clear_face_encodings",
                event={},
                device_id=self.device_id,  
                device_secret=self.api_key,
                request_method="DELETE"
            )
        except requests.RequestException as exc:
            raise Exception(f"Failed to clear face encodings: {exc}")

        if response.status_code >= 400:
            raise Exception(f"Backend error {response.status_code}: {response.text}")

        print("All face encodings cleared from backend.")
        return True

    def capture_new_face(self):
        face_encoding = None
        try:
            # Normalize device index: default to 0 and prefer integer indices.
            idx = 0
            if self.video_device_index is not None:
                try:
                    idx = int(self.video_device_index)
                except Exception:
                    idx = 0

            # On Windows prefer CAP_DSHOW to avoid backend issues; fallback if it fails.
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap.release()
                cap = cv2.VideoCapture(idx)  # fallback to default backend
            if not cap.isOpened():
                raise Exception(f"Could not open camera at index {idx}. Is a camera attached and accessible?")
 

            print("Press SPACE to capture your face, ESC to exit.")
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("Failed to capture frame.")
                    break
                cv2.imshow("Capture Face", frame)
                key = cv2.waitKey(1)
                if key == 27:  # ESC
                    print("Exiting without saving.")
                    break
                if key == 32:  # SPACE
                    # capture the frame
                    rgb_frame = prepare_frame(frame)
                    face_locations = face_recognition.face_locations(rgb_frame)
                    if len(face_locations) != 1:
                        print("Please ensure exactly one face is visible to capture.")
                        continue
                    face_encoding = face_recognition.face_encodings(rgb_frame, face_locations)[0]
                    print("Face captured.")
                    break

            cap.release()
            cv2.destroyAllWindows()
            return face_encoding
        except Exception as e:
            raise Exception(f"Error during face capture: {e}")
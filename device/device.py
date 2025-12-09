"""Sends real audio events captured through the recognizer to the backend."""

import argparse
import os
import time
import requests
import threading
import json
import pyaudio
import hashlib
import hmac

from event_sender import EventSender
from sound_recognizer import SoundRecognizer, list_input_devices
from video_recognizer import VideoRecognizer, list_video_devices

DEVICE_CONFIG = "device_config.json"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000/API/")
LOGIN_URL = os.environ.get("LOGIN_URL", "http://localhost:8000/auth/login")
EVENT_COOLDOWN_SEC = float(os.environ.get("EVENT_COOLDOWN_SEC", "1.0"))

def load_device_credentials():
    """Load stored device credentials."""
    if not os.path.exists(DEVICE_CONFIG):
        raise FileNotFoundError(
            f"{DEVICE_CONFIG} not found. Ask admin for device UUID and API key."
        )
    with open(DEVICE_CONFIG, "r") as f:
        return json.load(f)

def poll_for_user_assignment(api_key, max_wait_sec=300, sender: EventSender =None, device_uuid=None):
    """Poll backend until device is claimed by a user (max 5 min)."""
    start = time.time()
    print("Waiting for device to be claimed by a user on frontend...")
    
    while time.time() - start < max_wait_sec:
        try:
            res = sender.send_request(url="devices/info", event={}, device_id=device_uuid, device_secret=api_key, request_method="GET")
            
            if res.status_code == 200:
                credentials: dict = res.json().get("deviceCredential", {})
                user_id = credentials.get("user_id")
                device_id = credentials.get("device_uuid")
                claimed = credentials.get("claimed")
                print(f"Polled device info: user_id={user_id}, device_id={device_id}, claimed={claimed}")
                if user_id and device_id:
                    print(f"✓ Device claimed! User ID: {user_id}, Device ID: {device_id}")
                    return {"user_id": user_id, "device_id": device_id}
                else:
                    print(f"  Still waiting... (claimed: {claimed})")
            else:
                print(f"Poll failed: {res.status_code}")
        except Exception as e:
            print(f"Poll error: {e}")
        
        time.sleep(5)  # poll every 5 seconds
    
    raise TimeoutError("Device was not claimed within 5 minutes")

def _build_parser():
    parser = argparse.ArgumentParser(description="Capture audio triggers and forward them to the backend.")
    parser.add_argument("--audio-device-index", type=int, help="Input audio device index to use (use --list-devices to inspect).")
    parser.add_argument("--video-device-index", type=int, help="Input video device index to use (use --list-devices to inspect).")
    parser.add_argument("--device-name", help="Preferred device name substring (e.g., Logitech)")
    parser.add_argument("--list-devices", action="store_true", help="Show available microphone devices and exit.")
    parser.add_argument("--cooldown", type=float, default=EVENT_COOLDOWN_SEC, help="Minimum seconds between backend events.")
    parser.add_argument("--energy-threshold", type=float, default=200.0, help="Energy threshold passed to the recognizer to filter noise.")
    parser.add_argument("--delta-threshold", type=float, default=120.0, help="Minimum energy above the noise floor to trigger an event.")
    parser.add_argument("--silence-frames", type=int, default=4, help="Number of quiet frames required before allowing another trigger.")
    parser.add_argument("--new-face", action="store_true", help="Capture a new face encoding for this device.", default=False)
    return parser

def main():
    parser = _build_parser()
    args = parser.parse_args()

    pa = pyaudio.PyAudio()

    if args.list_devices:
        list_input_devices(pa)
        list_video_devices()
        return

    # Load device credentials (no user login needed!)
    try:
        config = load_device_credentials()
        device_uuid = config["device_id"]
        api_key = config["api_key"]
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return

    print(f"Device UUID: {device_uuid}")
    print(f"Tell user to enter this UUID on frontend to claim device.")

    # Now create EventSender with device info (no user token needed)
    sender = EventSender(
        device_id=device_uuid,
        api_key=api_key,  # device uses API key, not user token
        cooldown=args.cooldown,
        video_device_index=args.video_device_index,
        audio_device_index=args.audio_device_index
    )

    # Register with backend
    try:
        res = sender.send_request(url="devices/register", 
                                  event={}, 
                                  device_id=device_uuid, 
                                  device_secret=api_key, 
                                  request_method="POST", 
                                  )
        if res.status_code in [200, 409]:
            print("✓ Device registered with backend")
        else:
            print(f"Registration failed: {res.status_code} {res.text}")
            return
    except Exception as e:
        print(f"Registration error: {e}")
        return
    
    # Poll until user claims device
    device_info = poll_for_user_assignment(api_key, sender=sender, device_uuid=device_uuid)
    user_id = device_info["user_id"]
    device_id = device_info["device_id"]

    print(f"\n✓ Device fully configured!")
    print(f"  Device ID: {device_id}")
    print(f"  User ID: {user_id}")
    print(f"  Starting event listeners...\n")

    # If new face, capture it now
    if args.new_face:
        user_name = input("Enter your name: ")
        try:
            known_faces = sender.addNewFace(name=user_name)
        except Exception as e:
            print(f"Failed to add new encoding: {e}")
            return
    else:
        known_faces = sender.getFaces()

    soundSensor = SoundRecognizer(
        device_index=args.audio_device_index or 0,
        device_name=args.device_name,
        callback=sender.sendAudioEvent,
        energy_threshold=args.energy_threshold,
        delta_threshold=args.delta_threshold,
        silence_frames=args.silence_frames,
    )

    videoSensor = VideoRecognizer(
        device_index=args.video_device_index or 0,
        device_name=args.device_name,
        callback=sender.sendVideoEvent,
        faces=known_faces,
    )

    try:
        audio_thread = threading.Thread(target=soundSensor.run, daemon=True)
        video_thread = threading.Thread(target=videoSensor.run, daemon=True)
        audio_thread.start()
        video_thread.start()

        while audio_thread.is_alive() and video_thread.is_alive():
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\nStopping device listener...")


if __name__ == "__main__":
    main()
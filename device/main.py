import argparse
import time
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-device-index", type=int)
    parser.add_argument("--video-device-index", type=int)
    parser.add_argument("--device-name")
    parser.add_argument("--cooldown", type=float)
    parser.add_argument("--energy-threshold", type=float)
    parser.add_argument("--delta-threshold", type=float)
    parser.add_argument("--silence-frames", type=int)
    parser.add_argument("--new-face", action="store_true")
    args = parser.parse_args()

    cmd = ["python3", "device.py"] + sys.argv[1:]

    while True:
        print("Starting device.py...")
        proc = subprocess.Popen(cmd)
        proc.wait()
        print("device.py exited; restarting in 2 seconds...")
        time.sleep(2)

if __name__ == "__main__":
    main()
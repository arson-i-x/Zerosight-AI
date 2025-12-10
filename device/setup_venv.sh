#!/bin/bash
set -e

AP_SSID="zerosight-setup"
AP_PW="zerosight123"
WLAN_IF="wlan0"

echo "=== Updating packages ==="
apt update
apt install -y hostapd dnsmasq python3 python3-pip python3-venv \
               build-essential cmake python3-dev portaudio19-dev \
               libportaudio2 libportaudiocpp0 ffmpeg libsndfile1-dev

###################################
# Hostapd AP config
###################################
echo "=== Configuring hostapd ==="
cat >/etc/hostapd/hostapd.conf <<EOF
interface=$WLAN_IF
driver=nl80211
ssid=$AP_SSID
hw_mode=g
channel=6
wpa=2
wpa_passphrase=$AP_PW
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' >/etc/default/hostapd

###################################
# dnsmasq DHCP config
###################################
echo "=== Configuring dnsmasq ==="
[ -f /etc/dnsmasq.conf ] && mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
cat >/etc/dnsmasq.conf <<EOF
interface=$WLAN_IF
dhcp-range=192.168.4.10,192.168.4.100,12h
EOF

###################################
# Static IP for AP mode
###################################
echo "=== Configuring static IP for $WLAN_IF ==="
grep -q "$WLAN_IF" /etc/dhcpcd.conf || cat >>/etc/dhcpcd.conf <<EOF

interface $WLAN_IF
    static ip_address=192.168.4.1/24
EOF

###################################
# Provisioning server
###################################
mkdir -p /opt/provision
python3 -m venv /opt/provision/venv
/opt/provision/venv/bin/pip install --upgrade pip fastapi uvicorn

cat >/opt/provision/server.py <<'EOF'
from fastapi import FastAPI
import subprocess

app = FastAPI()

@app.post("/provision")
async def provision(data: dict):
    ssid = data["ssid"]
    pw = data["password"]

    # Build hashed PSK output
    psk = subprocess.check_output(["wpa_passphrase", ssid, pw]).decode()
    with open("/etc/wpa_supplicant/wpa_supplicant.conf", "w") as f:
        f.write(psk)

    # Switch out of AP mode
    subprocess.call(["systemctl", "stop", "hostapd"])
    subprocess.call(["systemctl", "stop", "dnsmasq"])
    subprocess.call(["systemctl", "restart", "wpa_supplicant"])
    subprocess.call(["wpa_cli", "-i", "wlan0", "reconfigure"])

    return {"status": "ok", "ssid": ssid}
EOF

###################################
# Systemd: provisioning server
###################################
cat >/etc/systemd/system/provision.service <<EOF
[Unit]
Description=Zerosight Provisioning Server
After=network.target

[Service]
ExecStart=/opt/provision/venv/bin/uvicorn server:app --host 0.0.0.0 --port 80
WorkingDirectory=/opt/provision
Restart=always

[Install]
WantedBy=multi-user.target
EOF

###################################
# Button-press AP toggle script
###################################
cat >/opt/provision/toggle_ap.sh <<'EOF'
#!/bin/bash
set -e

AP_SSID="zerosight-setup"
AP_PW="zerosight123"
WLAN_IF="wlan0"

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

MODE="$1"

if [ -z "$MODE" ]; then
    echo "Usage: $0 {ap|wifi}"
    exit 1
fi

start_ap() {
    echo "Switching to AP mode..."

    # Stop normal Wi-Fi
    systemctl stop wpa_supplicant || true

    # Configure static IP
    ip addr flush dev $WLAN_IF
    ip addr add 192.168.4.1/24 dev $WLAN_IF
    ip link set $WLAN_IF up

    # Start AP services
    systemctl start dnsmasq
    systemctl start hostapd
    systemctl restart provision

    echo "AP started: $AP_SSID ($AP_PW)"
    echo "SSH will work if connected to this AP (192.168.4.1)"
}

restore_wifi() {
    echo "Restoring normal Wi-Fi..."

    # Stop AP services
    systemctl stop hostapd || true
    systemctl stop dnsmasq || true

    # Flush IP and bring interface up
    ip addr flush dev $WLAN_IF
    ip link set $WLAN_IF up

    # Start wpa_supplicant and DHCP
    systemctl start wpa_supplicant
    dhclient $WLAN_IF || true
    systemctl restart provision

    echo "Normal Wi-Fi restored."
}

case "$MODE" in
    ap) start_ap ;;
    wifi) restore_wifi ;;
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: $0 {ap|wifi}"
        exit 1
        ;;
esac
EOF

chmod +x /opt/provision/toggle_ap.sh

###################################
# Enable systemd services
###################################
systemctl daemon-reload
systemctl enable provision.service

echo ""
echo "=== Setup complete ==="
echo "Toggle AP/Wi-Fi any time with:"
echo "sudo /opt/provision/toggle_ap.sh ap"
echo "sudo /opt/provision/toggle_ap.sh wifi"
echo "Provisioning server: http://192.168.4.1/"

# Python 3.10 may be installed as python3.10 or python3
PYTHON=$(which python3.10 || which python3)

###################################
# Python 3.10 venv setup
###################################

echo "=== Setting up Python 3.10 virtual environment ==="

# Python 3.10 may be installed as python3.10 or python3
PYTHON=$(which python3.10 || which python3)

echo "Using Python: $PYTHON"

if [ -z "$PYTHON" ]; then
    echo "ERROR: python3.10 not found!"
    echo "Install with:"
    echo "  sudo apt install python3.10 python3.10-venv python3.10-dev"
    exit 1
fi

echo "Creating venv..."
py -3.10 -m venv venv

echo "Activating venv..."
source venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing dependencies..."
pip install \
    cmake \
    face_recognition \
    dlib \
    opencv-python \
    numpy \
    librosa \
    pyaudio \
    requests

echo
echo "=== Virtual environment ready! ==="
echo "To activate later:"
echo "    source venv/bin/activate"
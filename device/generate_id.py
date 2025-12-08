import uuid, secrets

if __name__ == "__main__":
    device_uuid = str(uuid.uuid4())  # e.g. "550e8400-e29b-41d4-a716-446655440000"
    api_key = "sk_device_" + secrets.token_hex(32)  # 64 hex chars -> ~256 bits

    # store api_key_hash = bcrypt.hashpw(api_key.encode(), bcrypt.gensalt()).decode()
    print(device_uuid, api_key)
// db.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import 'dotenv/config';
import { encryptFaceEncoding, decryptFaceEncoding } from "./crypto.ts";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server can use service key
  {
      auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
      },
  }
);

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

export async function get_user_devices(userId: string) {  
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function add_device(userId: string, deviceId: string, deviceName: string, credentialId: string) {
    if (!userId) {
        throw new Error("No user ID provided");
    }
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!deviceName) {
        throw new Error("No device name provided");
    }
    if (!credentialId) {
        throw new Error("Device credential not found for device ID");
    }
    const { error: insertError } = await supabase
        .from("device_credentials")
        .update({ user_id: userId, claimed: true })
        .eq("id", credentialId)
    if (insertError) throw new Error("CREDENTIALS ERROR:" + insertError.message);
    const { data, error } = await supabase
        .from("devices")
        .upsert({ user_id: userId, device_credential_id: credentialId, name: deviceName })
        .eq("id", deviceId)
    if (error) throw new Error("UPDATE ERROR:" + error.message);
    return data;
}

export async function remove_device(deviceId: string, userId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("devices")
        .delete()
        .eq("id", deviceId)
        .eq("user_id", userId);
    if (error) throw error;
    return data;
}

export async function add_event(device_uuid: string, eventType: string, created_at: string, details: string) {
    if (!device_uuid) {
        throw new Error("No device UUID provided");
    }
    const { error } = await supabase
        .from("events")
        .insert({ device_id: device_uuid, event_type: eventType, created_at: created_at, details: details })
        .single();
    if (error) throw error;
}

export async function fetch_events(deviceId: string) {
    
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    console.log("Fetching events for device ID in DB:", deviceId);
    const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function add_face_encoding(deviceId: string, name: string, face: number[]) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!name) {
        throw new Error("No name provided");
    }
    if (!Array.isArray(face) || face.some(v => typeof v !== "number")) {
        throw new Error("Face encoding must be a flat array of numbers");
    }
    console.log("Encoding data:", face);
    const { data, error } = await supabase
        .from("face_encodings")
        .insert({ device_id: deviceId, 
                  name: name, 
                  encoding: encryptFaceEncoding(face) })
        .single();
    if (error) throw error;
    return data;
}

export async function get_face_encodings(deviceId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    const { data, error } = await supabase
        .from("face_encodings")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    try {
        for (let encoding of data) {
            encoding.encoding = decryptFaceEncoding(encoding.encoding);
        }
    } catch (err) {
        console.log("Error decrypting face encodings:", err);
    }
    return data;
}

export async function delete_all_face_encodings(userId: string) {
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("face_encodings")
        .delete()
        .eq("user_id", userId);
    if (error) throw error;
    return data;
}

export async function get_user_profile(userId: string) {
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
    if (error) {
        throw error;
    }
    return data;
}

export async function upsert_user_profile( emailOrPhone: string, userId: string, full_name: string, avatar_url?: string) {
    if (!userId) {  
        throw new Error("No user ID provided");
    }
    if (!emailOrPhone) {
        throw new Error("No contact info provided");
    }
    if (!full_name) {
        throw new Error("No full name provided");
    }
    const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: userId, contact: emailOrPhone, full_name, avatar_url, updated_at: new Date().toISOString() })
        .single();
    if (profileError) throw profileError;
    return profileData;
}

export async function store_pending_profile(full_name: string, avatar_url?: string, emailOrPhone?: string, ) {
    if (!emailOrPhone) {
        throw new Error("No contact info provided");
    }
    if (!full_name) {
        throw new Error("No full name provided");
    }
    const { data, error } = await supabase
        .from("pending_profiles")
        .upsert({ "contact": emailOrPhone?.toLowerCase(), full_name, avatar_url })
        .single();
    if (error) throw error;
    return data;
}

export async function get_pending_profile(emailOrPhone: string) {
    if (!emailOrPhone) {
        throw new Error("No contact info provided");
    }
    const { data, error } = await supabase
        .from("pending_profiles")
        .select("*")
        .eq("contact", emailOrPhone.toLowerCase())
        .single();
    if (error) {
        console.log("No pending profile found for contact:", emailOrPhone);
        return null;
    }
    return data;
}

export async function delete_pending_profile(emailOrPhone: string) {
    if (!emailOrPhone) {
        throw new Error("No contact info provided");
    }
    const { data, error } = await supabase
        .from("pending_profiles")
        .delete()
        .eq("contact", emailOrPhone.toLowerCase());
    if (error) throw error;
    return data;
}

export async function verify_device_action(deviceId: string, userId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", deviceId)
        .eq("user_id", userId)
        .single();
    if (error) {
        throw error;
    } 
    return data;
}

export async function get_device_credential_from_UUID(deviceId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .select("*")
        .eq("device_uuid", deviceId)
        .maybeSingle();
    if (error) {
        throw error;
    } 
    if (!data) {
        throw new Error("Device uuid does not exist");
    }
    return data;
}

export async function get_device_credential_from_api_key(apiKey: string) {
    if (!apiKey) {
        throw new Error("No API key provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .select("*")
        .eq("api_key", apiKey)
        .single();
    if (error) {
        throw error;
    } 
    if (!data) {
        throw new Error("Device key does not exist");
    }
    return data;
}

export async function create_device_credential(deviceId: string, apiKey: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!apiKey) {
        throw new Error("No API key provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .insert({ device_uuid: deviceId, api_key: apiKey })
        .single();
    if (error) throw error;
    return data;
}

export async function delete_device_credential(deviceId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .delete()
        .eq("device_uuid", deviceId);
    if (error) throw error;
    return data;
}

export async function get_device_credential_from_id(deviceId: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .select("*")
        .eq("id", deviceId)
        .single();
    if (error) throw error;
    return data;
}
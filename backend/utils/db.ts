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

export async function add_device(userId: string, deviceId: string, deviceName: string) {
    if (!userId) {
        throw new Error("No user ID provided");
    }
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!deviceName) {
        throw new Error("No device name provided");
    }
    const credentialData = await verify_device_exists(deviceId);
    const credential_id = credentialData?.id;
    console.log("Device credential ID fetched:", credentialData);
    if (!credential_id) {
        throw new Error("Invalid device ID");
    }
    const { data, error } = await supabase
        .from("devices")
        .insert({ user_id: userId, device_credential_id: credential_id, name: deviceName })
        .single();
    if (error) throw error;
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

export async function add_event(deviceId: string, userId: string, eventType: string, timestamp: string, details: string) {
    if (!deviceId) {
        throw new Error("No device ID provided");
    }
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { error } = await supabase
        .from("events")
        .insert({ device_id: deviceId, user_id: userId, event_type: eventType, timestamp, details })
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

export async function add_face_encoding(userId: string, name: string, face: number[]) {
    if (!userId) {
        throw new Error("No user ID provided");
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
        .insert({ user_id: userId, 
                  name: name, 
                  encoding: encryptFaceEncoding(face) })
        .single();
    if (error) throw error;
    return data;
}

export async function get_face_encodings(userId: string) {
    if (!userId) {
        throw new Error("No user ID provided");
    }
    const { data, error } = await supabase
        .from("face_encodings")
        .select("*")
        .eq("user_id", userId);
    if (error) throw error;
    data?.forEach(faceEncoding => {
        faceEncoding.encoding = decryptFaceEncoding(faceEncoding.encoding);
    });
    console.log("Face encodings fetched from DB:", data);
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
        console.log("No profile found for user:", userId);
        return { full_name: "", avatar_url: "", id: userId, email: "" };
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
    console.log("Pending profile fetched from DB:", data);
    return data;
}

export async function delete_pending_profile(emailOrPhone: string) {
    if (!emailOrPhone) {
        throw new Error("No contact info provided");
    }
    const { data, error } = await supabase
        .from("pending_profiles")
        .delete()
        .eq("contact", emailOrPhone);
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
        return { data: null, error };
    } 
    return data;
}

export async function verify_device_exists(deviceId: string) {
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

export async function verify_device_key(apiKey: string) {
    if (!apiKey) {
        throw new Error("No API key provided");
    }
    const { data, error } = await supabase
        .from("device_credentials")
        .select("*")
        .eq("api_key", apiKey)
        .maybeSingle();
    if (error) {
        throw error;
    } 
    if (!data) {
        throw new Error("Device key does not exist");
    }
    return data;
}
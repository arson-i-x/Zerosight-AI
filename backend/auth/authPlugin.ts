// auth.ts
import { fastify, type FastifyPluginAsync } from "fastify";
import { getSupabaseClient, upsert_user_profile, get_user_profile, store_pending_profile, get_pending_profile, delete_pending_profile } from "../utils/db.ts";
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const ACCESS_TOKEN_EXP = process.env.ACCESS_TOKEN_EXP || '15m';
const REFRESH_TOKEN_AGE = Number(process.env.REFRESH_TOKEN_AGE_SECONDS || 30 * 24 * 3600); // seconds
const JWT_SECRET = process.env.JWT_SECRET as string;

const supa = getSupabaseClient();

const auth_plugin: FastifyPluginAsync = async (fastify, opts) => {
  if (!JWT_SECRET) {
    throw new Error("Missing JWT_SECRET environment variable");
  }
  if (Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
    fastify.log.warn("JWT_SECRET is shorter than 32 bytes — use a 32+ byte secret for HS256");
  }

  fastify.post("/login", async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string};
    const { data, error } = await supa.auth.signInWithPassword({ email, password });

    if (error) return reply.status(401).send({ error: error.message });

    const userId = data.user?.id;
    if (!userId) return reply.status(500).send({ error: 'No user id from auth provider' });

    if (!process.env.JWT_SECRET) {
      return reply.status(500).send({ error: 'Server misconfiguration: missing JWT_SECRET' });
    }

    // Create our own short-lived access token (so backend controls verification)
    const accessToken = jwt.sign(
      { sub: userId, provider: 'supabase' },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXP } as jwt.SignOptions
    );

    // Create opaque refresh token, store its hash in DB
    const refreshToken = uuidv4() + '.' + crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_AGE * 1000).toISOString();
    try {
      await supa.from('refresh_tokens').insert([{ id: uuidv4(), user_id: userId, token_hash: tokenHash, expires_at: expiresAt }]);
    } catch (e) {
      fastify.log.error('Failed to persist refresh token: ' + String(e));
    }

    // Set HttpOnly refresh cookie
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_AGE,
    });

    // Fetch user profile
    const profile = await get_user_profile(userId);

    return { access_token: accessToken, user_id: userId, full_name: profile?.full_name || '', avatar_url: profile?.avatar_url || '' };
  });

  fastify.post("/signup", async (request, reply) => {
    const { email, phone, password, full_name, avatar_url } = request.body as any;

    if (!password || (!email && !phone)) {
      return reply.status(400).send({ error: "Email or phone and password required" });
    }

    if (!full_name) {
      return reply.status(400).send({ error: "Full name is required" });
    }

    try {
      // Sign up with Supabase — do NOT override redirectTo
      const { data, error } = email
        ? await supa.auth.signUp({ email, password })
        : await supa.auth.signUp({ phone, password });

      if (error) return reply.status(400).send({ error: error.message });

      const userId = data.user?.id;
      if (!userId) return reply.status(400).send({ error: "Failed to create user" });

      // Store pending profile data
      await store_pending_profile(full_name, avatar_url, email ?? phone); // Unsecure, but rate limited

      return reply.send({ ok: true, message: "Check your email or phone for confirmation instructions." });
    } catch (err) {
      fastify.log.error({ err }, "Signup error");
      return reply.status(500).send({ error: "Server error" });
    }
  });

  fastify.post('/update_profile', async (request, reply) => {
    const { email, password, full_name, avatar_url } = request.body as { email: string; password: string; full_name: string; avatar_url?: string };
    // sign in first to verify credentials
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return reply.status(401).send({ error: 'Invalid email or password' });
    const userId = data.user?.id;
    if (!userId) return reply.status(500).send({ error: 'No user id from auth provider' });

    if (!email || !password ) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    try {
      const profileData = await upsert_user_profile(email, userId, full_name, avatar_url);
      return reply.send({ profile: profileData });
    } catch (e) {
      return reply.status(500).send({ error: 'Failed to update profile' });
    }
  });

  // Refresh access token using HttpOnly refresh cookie (rotates refresh token)
  fastify.post('/refresh', async (request, reply) => {
    const raw = (request.cookies && request.cookies['refresh_token']) || null;
    if (!raw) return reply.code(401).send({ error: 'No refresh token' });

    const tokenHash = crypto.createHash('sha256').update(String(raw)).digest('hex');
    const { data: row, error: selErr } = await supa.from('refresh_tokens').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (selErr) {
      fastify.log.error('Refresh token lookup error: ' + String(selErr));
      return reply.code(500).send({ error: 'Server error' });
    }
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }

    // Rotate: create new refresh token and persist, revoke old
    const newRefresh = uuidv4() + '.' + crypto.randomBytes(24).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    try {
      await supa.from('refresh_tokens').insert([{ id: uuidv4(), user_id: row.user_id, token_hash: newHash, expires_at: new Date(Date.now() + REFRESH_TOKEN_AGE * 1000).toISOString() }]);
      await supa.from('refresh_tokens').update({ revoked: true }).eq('id', row.id);
    } catch (e) {
      fastify.log.error('Refresh token rotation error: ' + String(e));
      return reply.code(500).send({ error: 'Server error' });
    }

    if (!process.env.JWT_SECRET) return reply.code(500).send({ error: 'Server misconfiguration' });
    const accessToken = jwt.sign(
      { sub: row.user_id, provider: 'supabase' },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXP } as jwt.SignOptions
    );

    // Fetch user profile
    const profile = await get_user_profile(row.user_id);

    // Set rotated cookie
    reply.setCookie('refresh_token', newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_AGE,
    });
    console.log("User profile on refresh:", profile);
    console.log("Access token on refresh:", accessToken);
    return reply.send({ access_token: accessToken, user_id: row.user_id, full_name: profile?.full_name || '', avatar_url: profile?.avatar_url || '' });
  });

  // Logout: revoke refresh token and clear cookie
  fastify.post('/logout', async (request, reply) => {
    const raw = (request.cookies && request.cookies['refresh_token']) || null;
    if (raw) {
      const tokenHash = crypto.createHash('sha256').update(String(raw)).digest('hex');
      try {
        await supa.from('refresh_tokens').update({ revoked: true }).eq('token_hash', tokenHash);
      } catch (e) {
        fastify.log.error('Failed to revoke refresh token on logout: ' + String(e));
      }
    }
    reply.clearCookie('refresh_token', { path: '/' });
    return reply.send({ ok: true });
  });

  fastify.post('/confirm_email', async (request, reply) => {
    const { token_hash } = request.body as { token_hash: string };
    const { error, data } = await supa.auth.verifyOtp({ token_hash, type: "email" });
    if (error) {
      return reply.status(400).send({ error: error.message });
    }
    // Extract user email from token (assuming token contains email)
    const userEmail = data?.user?.email;
    const userId = data?.user?.id;
    if (!userEmail || !userId) {
      return reply.status(400).send({ error: 'Invalid token or missing user information' });
    }

    // If successful, check for pending profile
    try {
      const pending = await get_pending_profile(userEmail);
      if (pending) {
        // Upsert profile
        await upsert_user_profile(userEmail, userId, pending.full_name, pending.avatar_url || undefined);
        await delete_pending_profile(userEmail);
      }
    } catch (e) {
      fastify.log.error('Error handling pending profile on email confirmation: ' + String(e));
    }

    return reply.send({ ok: true });
  });
};

export default auth_plugin;

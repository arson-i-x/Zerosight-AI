'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (password !== confirm) {
        setError('Passwords do not match');
        return;
        }

        setLoading(true);
        try {
        const body = authMethod === 'email'
            ? { email: emailOrPhone, password, full_name: fullName, avatar_url: avatarUrl }
            : { phone: emailOrPhone, password, full_name: fullName, avatar_url: avatarUrl };

        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'include',
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            setError(data?.error || data?.message || 'Signup failed');
        } else {
            setError(data.message);
        }
        } catch (err) {
        setError('Network error');
        } finally {
        setLoading(false);
        }
    }

   return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSignup}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm"
      >
        <h2 className="text-2xl font-semibold mb-6 text-center">Create account</h2>

        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}

        {/* Auth method toggle */}
        <div className="mb-4 flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="authMethod"
              value="email"
              checked={authMethod === 'email'}
              onChange={() => setAuthMethod('email')}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Email</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="authMethod"
              value="phone"
              checked={authMethod === 'phone'}
              onChange={() => setAuthMethod('phone')}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Phone</span>
          </label>
        </div>

        {/* Email or phone input */}
        <label className="block mb-3">
          <span className="text-sm text-gray-700">{authMethod === 'email' ? 'Email' : 'Phone'}</span>
          <input
            type={authMethod === 'email' ? 'email' : 'tel'}
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            placeholder={authMethod === 'email' ? 'user@example.com' : '+1234567890'}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm text-gray-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm"
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm text-gray-700">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm"
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm text-gray-700">Full Name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm"
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm text-gray-700">Avatar URL</span>
          <input
            type="text"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create account'}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full mt-2 border border-gray-300 text-gray-700 py-2 rounded"
          >
            Back to login
          </button>
        </div>
      </form>
    </div>
  );
}

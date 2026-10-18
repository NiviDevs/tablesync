"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function RestaurantSignIn() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const error = new URLSearchParams(location.search).get('error');
    if (error) setMessage(error);
    fetch('/api/demo-session').then(response => response.json()).then(value => setDemo(value.enabled)).catch(() => {});
  }, []);
  async function demoSignIn(role: 'owner' | 'operator') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/demo-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      location.assign(result.next);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in'); setBusy(false); }
  }
  async function send() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setMessage('Email sign-in is unavailable in this environment.'); return;
    }
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || location.origin;
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/restaurant/dashboard` } });
    setMessage(error ? error.message : 'Check your email for a restaurant sign-in link.');
  }
  return <main className="arrival-page"><Link className="brand" href="/">table<i>sync</i></Link><section className="arrival-card">
    <p className="kicker">{demo ? 'Local educational demo' : 'Restaurant access'}</p><h1>{demo ? 'Choose your view.' : 'Welcome back.'}</h1>
    <p className="arrival-table">Juniper House</p>
    {demo ? <><p>No account needed for this local demo. Guest ordering works separately in another browser.</p>
      <button className="primary-button full" disabled={busy} onClick={() => demoSignIn('owner')}>Open owner and kitchen</button>
      <button className="primary-button full demo-role-button" disabled={busy} onClick={() => demoSignIn('operator')}>Open DevOps view</button>
      <p className="quiet-note">Demo access is enabled on this instance. Payments are simulated.</p>
    </> : <><label htmlFor="email">Work email</label><input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@restaurant.com" />
      <button className="primary-button full" disabled={!email} onClick={send}>Email me a sign-in link</button></>}
    {message && <p role="alert" className="quiet-note">{message}</p>}
  </section></main>;
}

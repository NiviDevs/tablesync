import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
export async function GET(request: Request) { const url = new URL(request.url); const code = url.searchParams.get('code'); const next = url.searchParams.get('next'); const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/restaurant'; if (code) { const supabase = createClient(await cookies()); const { error } = await supabase.auth.exchangeCodeForSession(code); if (error) return NextResponse.redirect(new URL(`/restaurant/sign-in?error=${encodeURIComponent(error.message)}`, url.origin)); } return NextResponse.redirect(new URL(safeNext, url.origin)); }

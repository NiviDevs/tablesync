import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
export async function GET(request: Request) { const url = new URL(request.url); const code = url.searchParams.get('code'); const next = url.searchParams.get('next'); const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/restaurant'; if (code) { const supabase = createClient(await cookies()); await supabase.auth.exchangeCodeForSession(code); } return NextResponse.redirect(new URL(safeNext, url.origin)); }

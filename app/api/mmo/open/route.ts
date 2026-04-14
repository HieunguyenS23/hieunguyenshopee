import { NextResponse } from 'next/server';

const FRIEND_BASE = process.env.FRIENDSHOUSE_BASE_URL || 'https://friendshouse.io.vn';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get('token') || '').trim();

  if (!token) {
    return NextResponse.json({ error: 'Thieu token.' }, { status: 400 });
  }

  const target = new URL('/api/netflix-free/open', FRIEND_BASE);
  target.searchParams.set('token', token);

  return NextResponse.redirect(target.toString(), { status: 302 });
}

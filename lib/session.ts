import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/lib/types';

const COOKIE_NAME = 'order_portal_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';
const CUSTOMER_USERNAME = process.env.CUSTOMER_USERNAME || 'khach01';
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || '123456';
const CUSTOMER2_USERNAME = process.env.CUSTOMER2_USERNAME || 'khach02';
const CUSTOMER2_PASSWORD = process.env.CUSTOMER2_PASSWORD || '123456';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-please';

export type SessionPayload = {
  username: string;
  role: UserRole;
  exp: number;
};

function sign(payload: string) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

export function hashPassword(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function getAdminSeed() {
  return {
    username: APP_USERNAME,
    passwordHash: hashPassword(APP_PASSWORD),
    passwordPlain: APP_PASSWORD,
    role: 'admin' as const,
    createdAt: new Date().toISOString(),
  };
}

export function getCustomerSeed() {
  return {
    username: CUSTOMER_USERNAME,
    passwordHash: hashPassword(CUSTOMER_PASSWORD),
    passwordPlain: CUSTOMER_PASSWORD,
    role: 'customer' as const,
    createdAt: new Date().toISOString(),
  };
}

export function getCustomerSeed2() {
  return {
    username: CUSTOMER2_USERNAME,
    passwordHash: hashPassword(CUSTOMER2_PASSWORD),
    passwordPlain: CUSTOMER2_PASSWORD,
    role: 'customer' as const,
    createdAt: new Date().toISOString(),
  };
}

export function createSessionToken(username: string, role: UserRole) {
  const payload: SessionPayload = {
    username,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${base}.${sign(base)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token || !token.includes('.')) return null;
  const [base, signature] = token.split('.');
  if (sign(base) !== signature) return null;
  const parsed = JSON.parse(Buffer.from(base, 'base64url').toString('utf8')) as SessionPayload;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export async function getSession() {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== 'admin') redirect('/orders/new');
  return session;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}


export async function requireAdminOrCtv() {
  const session = await requireSession();
  if (session.role !== 'admin' && session.role !== 'ctv') redirect('/orders/new');
  return session;
}

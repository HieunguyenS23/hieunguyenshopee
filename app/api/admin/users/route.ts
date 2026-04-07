import { NextResponse } from 'next/server';
import { hashPassword, requireAdmin } from '@/lib/session';
import {
  createUser,
  deleteUserRecord,
  findUser,
  getMessages,
  getUnreadMessageCountBySender,
  getUserProfile,
  getUsers,
  renameUsername,
  updateUserProfile,
  updateUserRecord,
} from '@/lib/store';
import type { UserRole } from '@/lib/types';
import { isValidUsername } from '@/lib/validators';

function sanitizeUser(user: { username: string; role: UserRole; createdAt: string; passwordPlain?: string }, includePassword = false) {
  return {
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    ...(includePassword ? { passwordPlain: user.passwordPlain || '' } : {}),
  };
}

export async function GET(request: Request) {
  const session = await requireAdmin();
  const { searchParams } = new URL(request.url);
  const username = String(searchParams.get('username') || '').trim().toLowerCase();

  try {
    if (!username) {
      const users = await getUsers();
      const unreadBySender = await getUnreadMessageCountBySender(session.username);
      return NextResponse.json({
        users: users.map((u) => ({
          ...sanitizeUser(u, true),
          unreadCount: Number(unreadBySender[u.username] || 0),
        })),
      });
    }

    const user = await findUser(username);
    if (!user) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });

    const profile = await getUserProfile(username);
    const messages = await getMessages({ username: session.username, role: 'admin', target: username });

    return NextResponse.json({ user: sanitizeUser(user, true), profile, messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không tải được dữ liệu tài khoản.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  const roleRaw = String(body.role || 'customer').trim();
  const role = roleRaw === 'admin' ? 'admin' : (roleRaw === 'ctv' ? 'ctv' : 'customer');

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'Username phải từ 5 ký tự, chỉ gồm chữ thường không dấu, số hoặc gạch dưới.' }, { status: 400 });
  }
  if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu phải từ 6 ký tự.' }, { status: 400 });
  if (await findUser(username)) return NextResponse.json({ error: 'Username đã tồn tại.' }, { status: 409 });

  try {
    const user = await createUser({
      username,
      passwordHash: hashPassword(password),
      passwordPlain: password,
      role,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, user: sanitizeUser(user, true) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không tạo được tài khoản.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  await requireAdmin();
  const body = await request.json();
  const username = String(body.username || '').trim().toLowerCase();
  const nextUsername = body.nextUsername === undefined ? undefined : String(body.nextUsername || '').trim().toLowerCase();
  const password = body.password === undefined ? undefined : String(body.password || '').trim();
  const roleRaw = body.role === undefined ? undefined : String(body.role || '').trim();

  const phone = body.phone === undefined ? undefined : String(body.phone || '').trim();
  const email = body.email === undefined ? undefined : String(body.email || '').trim();
  const zaloNumber = body.zaloNumber === undefined ? undefined : String(body.zaloNumber || '').trim();
  const bankAccount = body.bankAccount === undefined ? undefined : String(body.bankAccount || '').trim();
  const bankName = body.bankName === undefined ? undefined : String(body.bankName || '').trim();
  const bio = body.bio === undefined ? undefined : String(body.bio || '').trim();
  const avatarImage = body.avatarImage === undefined ? undefined : String(body.avatarImage || '').trim();

  if (!username) return NextResponse.json({ error: 'Thiếu username.' }, { status: 400 });

  if (nextUsername !== undefined && !isValidUsername(nextUsername)) {
    return NextResponse.json({ error: 'Username mới phải từ 5 ký tự, chỉ gồm chữ thường không dấu, số hoặc gạch dưới.' }, { status: 400 });
  }

  if (password !== undefined && password.length > 0 && password.length < 6) {
    return NextResponse.json({ error: 'Mật khẩu mới phải từ 6 ký tự.' }, { status: 400 });
  }
  if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 });
  }
  if (zaloNumber !== undefined && zaloNumber && !/^\d{8,15}$/.test(zaloNumber)) {
    return NextResponse.json({ error: 'Số Zalo chỉ gồm số, từ 8 đến 15 ký tự.' }, { status: 400 });
  }
  if (bankAccount !== undefined && bankAccount.length > 40) {
    return NextResponse.json({ error: 'Số tài khoản tối đa 40 ký tự.' }, { status: 400 });
  }
  if (bankName !== undefined && bankName.length > 80) {
    return NextResponse.json({ error: 'Tên ngân hàng tối đa 80 ký tự.' }, { status: 400 });
  }
  if (avatarImage !== undefined && avatarImage.length > 12_000_000) {
    return NextResponse.json({ error: 'Ảnh đại diện quá lớn. Vui lòng chọn ảnh nhỏ hơn 12MB.' }, { status: 400 });
  }

  const payload: { passwordHash?: string; passwordPlain?: string; role?: UserRole } = {};
  if (password && password.length >= 6) {
    payload.passwordHash = hashPassword(password);
    payload.passwordPlain = password;
  }
  if (roleRaw !== undefined) payload.role = roleRaw === 'admin' ? 'admin' : (roleRaw === 'ctv' ? 'ctv' : 'customer');

  try {
    if (nextUsername && nextUsername !== username) {
      await renameUsername(username, nextUsername);
    }

    const targetUsername = nextUsername && nextUsername !== username ? nextUsername : username;

    if (payload.passwordHash || payload.role) {
      await updateUserRecord(targetUsername, payload);
    }

    if (phone !== undefined || email !== undefined || zaloNumber !== undefined || bankAccount !== undefined || bankName !== undefined || bio !== undefined || avatarImage !== undefined) {
      await updateUserProfile(targetUsername, { phone, email, zaloNumber, bankAccount, bankName, bio, avatarImage });
    }

    const user = await findUser(targetUsername);
    const profile = await getUserProfile(targetUsername);
    if (!user) throw new Error('Không tìm thấy tài khoản sau cập nhật.');

    return NextResponse.json({ ok: true, user: sanitizeUser(user, true), profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không cập nhật được tài khoản.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const username = String(searchParams.get('username') || '').trim().toLowerCase();
  if (!username) return NextResponse.json({ error: 'Thiếu username.' }, { status: 400 });

  try {
    await deleteUserRecord(username);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không xóa được tài khoản.' }, { status: 500 });
  }
}

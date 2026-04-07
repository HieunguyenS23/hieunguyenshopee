import { promises as fs } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import type {
  AnnouncementRecord,
  AppSettingsRecord,
  MessageRecord,
  OrderRecord,
  OrderStatus,
  StoreData,
  UserProfileRecord,
  UserRecord,
  VoucherRecord,
} from '@/lib/types';
import { getAdminSeed, getCustomerSeed, getCustomerSeed2 } from '@/lib/session';

const storeFile = path.join(process.cwd(), 'data', 'store.json');
const memoryStore = globalThis as typeof globalThis & { __portalStore?: StoreData; __portalDbReady?: boolean };
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const hasDatabase = Boolean(databaseUrl);
const sql = hasDatabase ? neon(databaseUrl) : null;

const allowedStatuses: OrderStatus[] = ['pending', 'confirmed', 'ordered', 'canceled'];
const defaultAvatarColors = ['#ff6d3f', '#2f7e79', '#4165d2', '#b85f16', '#8c4ccf', '#087f5b'];

function normalizeStatus(value: unknown): OrderStatus {
  const raw = String(value || '').toLowerCase() as OrderStatus;
  return allowedStatuses.includes(raw) ? raw : 'pending';
}

function pickColorByUsername(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) hash += username.charCodeAt(i);
  return defaultAvatarColors[hash % defaultAvatarColors.length];
}

function createDefaultProfile(username: string): UserProfileRecord {
  return {
    username,
    displayName: username,
    phone: '',
    address: '',
    email: '',
    zaloNumber: '',
    bankAccount: '',
    bankName: '',
    bio: '',
    avatarColor: pickColorByUsername(username),
    avatarImage: '',
    lastSeenAnnouncementsAt: '',
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultVouchers(): VoucherRecord[] {
  const now = new Date().toISOString();
  return [
    { id: '100k', label: 'Mã 100k', price: 100000, active: true, createdAt: now, updatedAt: now },
    { id: '80k', label: 'Mã 80k', price: 80000, active: true, createdAt: now, updatedAt: now },
    { id: '60k', label: 'Mã 60k', price: 60000, active: true, createdAt: now, updatedAt: now },
  ];
}

function createDefaultSettings(): AppSettingsRecord {
  return {
    orderFormEnabled: true,
    updatedAt: new Date().toISOString(),
  };
}

function ensureCollections(data: StoreData) {
  if (!Array.isArray(data.profiles)) data.profiles = [];
  if (!Array.isArray(data.announcements)) data.announcements = [];
  if (!Array.isArray(data.messages)) data.messages = [];
  if (!Array.isArray(data.vouchers)) data.vouchers = createDefaultVouchers();
  if (!data.settings || typeof data.settings !== 'object') data.settings = createDefaultSettings();
}

function ensureSeedUsers(data: StoreData) {
  ensureCollections(data);
  const admin = getAdminSeed();
  const customer = getCustomerSeed();
  const customer2 = getCustomerSeed2();

  if (!data.users.some((item) => item.username === admin.username)) data.users.unshift(admin);
  if (!data.users.some((item) => item.username === customer.username)) data.users.push(customer);
  if (!data.users.some((item) => item.username === customer2.username)) data.users.push(customer2);

  for (const user of data.users) {
    if (!data.profiles.some((item) => item.username === user.username)) {
      data.profiles.push(createDefaultProfile(user.username));
    }
  }
}

function defaultStore(): StoreData {
  const base: StoreData = {
    users: [],
    orders: [],
    profiles: [],
    announcements: [],
    messages: [],
    vouchers: createDefaultVouchers(),
    settings: createDefaultSettings(),
  };
  ensureSeedUsers(base);
  return base;
}

function ensurePersistentOrderStore() {
  if (!sql && process.env.NODE_ENV === 'production') {
    throw new Error('Hệ thống chưa cấu hình DATABASE_URL nên chưa thể lưu đơn ổn định giữa khách và admin.');
  }
}

async function ensureDatabaseReady() {
  if (!sql) return;
  if (memoryStore.__portalDbReady) return;

  await sql`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    password_plain TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain TEXT NOT NULL DEFAULT ''`;

  await sql`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_public_id TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_line TEXT NOT NULL,
    ward TEXT NOT NULL,
    district TEXT NOT NULL,
    province TEXT NOT NULL,
    voucher_type TEXT NOT NULL,
    product_link TEXT NOT NULL,
    variant TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL,
    order_code TEXT NOT NULL DEFAULT '',
    order_amount TEXT NOT NULL DEFAULT '',
    delivery_status TEXT NOT NULL DEFAULT '',
    delivery_checked_at TEXT NOT NULL DEFAULT '',
    delivery_tracking TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    processing_cookie TEXT NOT NULL DEFAULT '',
    processing_account TEXT NOT NULL DEFAULT '',
    order_image TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_public_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_amount TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_checked_at TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_tracking TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_cookie TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_account TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_image TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT ''`;
  await sql`CREATE TABLE IF NOT EXISTS user_profiles (
    username TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    zalo_number TEXT NOT NULL DEFAULT '',
    bank_account TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar_color TEXT NOT NULL DEFAULT '',
    avatar_image TEXT NOT NULL DEFAULT '',
    last_seen_announcements_at TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_image TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_seen_announcements_at TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS zalo_number TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bank_account TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT ''`;

  await sql`CREATE TABLE IF NOT EXISTS admin_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS admin_user_messages (
    id TEXT PRIMARY KEY,
    from_username TEXT NOT NULL,
    to_username TEXT NOT NULL,
    content TEXT NOT NULL,
    image_data TEXT NOT NULL DEFAULT '',
    read_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE admin_user_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL`;
  await sql`ALTER TABLE admin_user_messages ADD COLUMN IF NOT EXISTS image_data TEXT NOT NULL DEFAULT ''`;

  await sql`CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS app_settings (
    id SMALLINT PRIMARY KEY,
    order_form_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  const admin = getAdminSeed();
  const customer = getCustomerSeed();
  const customer2 = getCustomerSeed2();

  await sql`
    INSERT INTO users (username, password_hash, password_plain, role, created_at)
    VALUES (${admin.username}, ${admin.passwordHash}, ${admin.passwordPlain || ''}, ${admin.role}, ${admin.createdAt})
    ON CONFLICT (username) DO NOTHING
  `;

  await sql`
    INSERT INTO users (username, password_hash, password_plain, role, created_at)
    VALUES (${customer.username}, ${customer.passwordHash}, ${customer.passwordPlain || ''}, ${customer.role}, ${customer.createdAt})
    ON CONFLICT (username) DO NOTHING
  `;

  await sql`
    INSERT INTO users (username, password_hash, password_plain, role, created_at)
    VALUES (${customer2.username}, ${customer2.passwordHash}, ${customer2.passwordPlain || ''}, ${customer2.role}, ${customer2.createdAt})
    ON CONFLICT (username) DO NOTHING
  `;

  const seededUsers = [admin.username, customer.username, customer2.username];
  for (const username of seededUsers) {
    const profile = createDefaultProfile(username);
    await sql`
      INSERT INTO user_profiles (username, display_name, phone, address, email, zalo_number, bank_account, bank_name, bio, avatar_color, avatar_image, last_seen_announcements_at, updated_at)
      VALUES (${username}, ${profile.displayName}, ${profile.phone}, ${profile.address}, ${profile.email}, ${profile.zaloNumber}, ${profile.bankAccount}, ${profile.bankName}, ${profile.bio}, ${profile.avatarColor}, ${profile.avatarImage}, ${profile.lastSeenAnnouncementsAt}, ${profile.updatedAt})
      ON CONFLICT (username) DO NOTHING
    `;
  }

  const vouchers = createDefaultVouchers();
  for (const voucher of vouchers) {
    await sql`
      INSERT INTO vouchers (id, label, price, active, created_at, updated_at)
      VALUES (${voucher.id}, ${voucher.label}, ${voucher.price}, ${voucher.active}, ${voucher.createdAt}, ${voucher.updatedAt})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const settings = createDefaultSettings();
  await sql`
    INSERT INTO app_settings (id, order_form_enabled, updated_at)
    VALUES (1, ${settings.orderFormEnabled}, ${settings.updatedAt})
    ON CONFLICT (id) DO NOTHING
  `;

  memoryStore.__portalDbReady = true;
}

async function readFileStore() {
  try {
    const raw = await fs.readFile(storeFile, 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    ensureSeedUsers(parsed);
    parsed.orders = (parsed.orders || []).map((order) => ({
      ...order,
      orderPublicId: String((order as any).orderPublicId || ''),
      status: normalizeStatus(order.status),
      orderCode: String(order.orderCode || ''),
      orderAmount: String(order.orderAmount || ''),
      deliveryStatus: String(order.deliveryStatus || ''),
      deliveryCheckedAt: String(order.deliveryCheckedAt || ''),
      deliveryTracking: String(order.deliveryTracking || ''),
      productName: String(order.productName || ''),
      processingCookie: String(order.processingCookie || ''),
      processingAccount: String(order.processingAccount || ''),
      orderImage: String((order).orderImage || ''),
      adminNote: String((order).adminNote || ''),
    }));
    parsed.profiles = (parsed.profiles || []).map((profile) => ({
      ...createDefaultProfile(String(profile.username || '')),
      username: String(profile.username || ''),
      displayName: String(profile.displayName || profile.username || ''),
      phone: String(profile.phone || ''),
      address: String(profile.address || ''),
      email: String(profile.email || ''),
      zaloNumber: String(profile.zaloNumber || ''),
      bankAccount: String(profile.bankAccount || ''),
      bankName: String(profile.bankName || ''),
      bio: String(profile.bio || ''),
      avatarColor: String(profile.avatarColor || pickColorByUsername(String(profile.username || ''))),
      avatarImage: String(profile.avatarImage || ''),
      lastSeenAnnouncementsAt: String(profile.lastSeenAnnouncementsAt || ''),
      updatedAt: String(profile.updatedAt || new Date().toISOString()),
    })).filter((profile) => Boolean(profile.username));
    parsed.announcements = (parsed.announcements || []).map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || ''),
      content: String(item.content || ''),
      createdBy: String(item.createdBy || 'admin'),
      createdAt: String(item.createdAt || new Date().toISOString()),
    })).filter((item) => item.id && item.title && item.content);
    parsed.messages = (parsed.messages || []).map((item) => ({
      id: String(item.id || ''),
      from: String(item.from || ''),
      to: String(item.to || ''),
      content: String(item.content || ''),
      imageData: String((item as any).imageData || ''),
      createdAt: String(item.createdAt || new Date().toISOString()),
      readAt: String(item.readAt || ''),
    })).filter((item) => item.id && item.from && item.to && (item.content || item.imageData));
    parsed.vouchers = (parsed.vouchers || []).map((item) => ({
      id: String(item.id || '').trim(),
      label: String(item.label || '').trim(),
      price: Math.max(0, Number(item.price || 0)),
      active: Boolean(item.active),
      createdAt: String(item.createdAt || new Date().toISOString()),
      updatedAt: String(item.updatedAt || new Date().toISOString()),
    })).filter((item) => Boolean(item.id) && Boolean(item.label));
    if (parsed.vouchers.length === 0) parsed.vouchers = createDefaultVouchers();
    parsed.settings = {
      orderFormEnabled: parsed.settings?.orderFormEnabled !== false,
      updatedAt: String(parsed.settings?.updatedAt || new Date().toISOString()),
    };
    ensureSeedUsers(parsed);
    return parsed;
  } catch {
    const fresh = defaultStore();
    await fs.mkdir(path.dirname(storeFile), { recursive: true });
    await fs.writeFile(storeFile, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

async function writeFileStore(data: StoreData) {
  await fs.mkdir(path.dirname(storeFile), { recursive: true });
  await fs.writeFile(storeFile, JSON.stringify(data, null, 2), 'utf8');
}

async function readMemoryStore() {
  if (!memoryStore.__portalStore) memoryStore.__portalStore = defaultStore();
  ensureSeedUsers(memoryStore.__portalStore);
  return memoryStore.__portalStore;
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    username: String(row.username),
    passwordHash: String(row.password_hash),
    passwordPlain: String(row.password_plain || ''),
    role: row.role === 'admin' ? 'admin' : (row.role === 'ctv' ? 'ctv' : 'customer'),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: String(row.id),
    orderPublicId: String(row.order_public_id || ''),
    username: String(row.username),
    recipientName: String(row.recipient_name),
    phone: String(row.phone),
    addressLine: String(row.address_line),
    ward: String(row.ward),
    district: String(row.district),
    province: String(row.province),
    voucherType: String(row.voucher_type) as OrderRecord['voucherType'],
    productLink: String(row.product_link),
    variant: String(row.variant),
    quantity: Number(row.quantity),
    status: normalizeStatus(row.status),
    orderCode: String(row.order_code || ''),
    orderAmount: String(row.order_amount || ''),
    deliveryStatus: String(row.delivery_status || ''),
    deliveryCheckedAt: String(row.delivery_checked_at || ''),
    deliveryTracking: String(row.delivery_tracking || ''),
    productName: String(row.product_name || ''),
    processingCookie: String(row.processing_cookie || ''),
    processingAccount: String(row.processing_account || ''),
    orderImage: String(row.order_image || ''),
    adminNote: String(row.admin_note || ''),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapProfile(row: Record<string, unknown>): UserProfileRecord {
  return {
    username: String(row.username),
    displayName: String(row.display_name || row.username || ''),
    phone: String(row.phone || ''),
    address: String(row.address || ''),
    email: String(row.email || ''),
    zaloNumber: String(row.zalo_number || ''),
    bankAccount: String(row.bank_account || ''),
    bankName: String(row.bank_name || ''),
    bio: String(row.bio || ''),
    avatarColor: String(row.avatar_color || pickColorByUsername(String(row.username || ''))),
    avatarImage: String(row.avatar_image || ''),
    lastSeenAnnouncementsAt: String(row.last_seen_announcements_at || ''),
    updatedAt: new Date(String(row.updated_at || Date.now())).toISOString(),
  };
}

function mapAnnouncement(row: Record<string, unknown>): AnnouncementRecord {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    content: String(row.content || ''),
    createdBy: String(row.created_by || 'admin'),
    createdAt: new Date(String(row.created_at || Date.now())).toISOString(),
  };
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: String(row.id),
    from: String(row.from_username || row.from || ''),
    to: String(row.to_username || row.to || ''),
    content: String(row.content || ''),
    imageData: String(row.image_data || ''),
    createdAt: new Date(String(row.created_at || Date.now())).toISOString(),
    readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : '',
  };
}

function mapVoucher(row: Record<string, unknown>): VoucherRecord {
  return {
    id: String(row.id || ''),
    label: String(row.label || ''),
    price: Math.max(0, Number(row.price || 0)),
    active: Boolean(row.active),
    createdAt: new Date(String(row.created_at || Date.now())).toISOString(),
    updatedAt: new Date(String(row.updated_at || Date.now())).toISOString(),
  };
}

export async function findUser(username: string) {
  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`SELECT username, password_hash, password_plain, role, created_at FROM users WHERE username = ${username} LIMIT 1`;
    if (rows.length === 0) return null;
    return mapUser(rows[0] as Record<string, unknown>);
  }

  if (process.env.NODE_ENV === 'development') {
    const store = await readFileStore();
    return store.users.find((item) => item.username === username) || null;
  }

  const store = await readMemoryStore();
  return store.users.find((item) => item.username === username) || null;
}

export async function createUser(user: UserRecord) {
  if (sql) {
    await ensureDatabaseReady();
    const existing = await sql`SELECT username FROM users WHERE username = ${user.username} LIMIT 1`;
    if (existing.length > 0) throw new Error('Tên đăng nhập đã tồn tại.');
    await sql`
      INSERT INTO users (username, password_hash, password_plain, role, created_at)
      VALUES (${user.username}, ${user.passwordHash}, ${user.passwordPlain || ''}, ${user.role}, ${user.createdAt})
    `;
    const profile = createDefaultProfile(user.username);
    await sql`
      INSERT INTO user_profiles (username, display_name, phone, address, email, zalo_number, bank_account, bank_name, bio, avatar_color, avatar_image, last_seen_announcements_at, updated_at)
      VALUES (${profile.username}, ${profile.displayName}, ${profile.phone}, ${profile.address}, ${profile.email}, ${profile.zaloNumber}, ${profile.bankAccount}, ${profile.bankName}, ${profile.bio}, ${profile.avatarColor}, ${profile.avatarImage}, ${profile.lastSeenAnnouncementsAt}, ${profile.updatedAt})
      ON CONFLICT (username) DO NOTHING
    `;
    return user;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  if (store.users.some((item) => item.username === user.username)) throw new Error('Tên đăng nhập đã tồn tại.');
  store.users.push(user);
  if (!store.profiles.some((item) => item.username === user.username)) {
    store.profiles.push(createDefaultProfile(user.username));
  }
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return user;
}

export async function createOrder(order: OrderRecord) {
  ensurePersistentOrderStore();

  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO orders (
        id, order_public_id, username, recipient_name, phone, address_line, ward, district, province,
        voucher_type, product_link, variant, quantity, status, order_code, order_amount,
        delivery_status, delivery_checked_at, delivery_tracking, product_name, processing_cookie,
        processing_account, order_image, admin_note, created_at
      ) VALUES (
        ${order.id}, ${order.orderPublicId}, ${order.username}, ${order.recipientName}, ${order.phone}, ${order.addressLine}, ${order.ward},
        ${order.district}, ${order.province}, ${order.voucherType}, ${order.productLink}, ${order.variant},
        ${order.quantity}, ${order.status}, ${order.orderCode}, ${order.orderAmount}, ${order.deliveryStatus},
        ${order.deliveryCheckedAt}, ${order.deliveryTracking}, ${order.productName || ''}, ${order.processingCookie},
        ${order.processingAccount}, ${order.orderImage || ''}, ${order.adminNote || ''}, ${order.createdAt}
      )
    `;
    return order;
  }

  const store = await readFileStore();
  store.orders.unshift(order);
  await writeFileStore(store);
  return order;
}

export async function updateOrder(
  orderId: string,
  payload: Partial<Pick<OrderRecord, 'orderPublicId' | 'status' | 'recipientName' | 'phone' | 'addressLine' | 'ward' | 'district' | 'province' | 'voucherType' | 'productLink' | 'variant' | 'quantity' | 'orderCode' | 'orderAmount' | 'deliveryStatus' | 'deliveryCheckedAt' | 'deliveryTracking' | 'productName' | 'processingCookie' | 'processingAccount' | 'orderImage' | 'adminNote'>>
) {
  ensurePersistentOrderStore();

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, order_public_id, username, recipient_name, phone, address_line, ward, district, province,
             voucher_type, product_link, variant, quantity, status, order_code, order_amount,
             delivery_status, delivery_checked_at, delivery_tracking, product_name, processing_cookie,
             processing_account, order_image, admin_note, created_at
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;
    if (rows.length === 0) throw new Error('Không tìm thấy đơn hàng.');

    const current = mapOrder(rows[0] as Record<string, unknown>);
    const nextOrderPublicId = payload.orderPublicId ?? current.orderPublicId;
    const nextStatus = payload.status ? normalizeStatus(payload.status) : current.status;
    const nextRecipientName = payload.recipientName ?? current.recipientName;
    const nextPhone = payload.phone ?? current.phone;
    const nextAddressLine = payload.addressLine ?? current.addressLine;
    const nextWard = payload.ward ?? current.ward;
    const nextDistrict = payload.district ?? current.district;
    const nextProvince = payload.province ?? current.province;
    const nextVoucherType = payload.voucherType ?? current.voucherType;
    const nextProductLink = payload.productLink ?? current.productLink;
    const nextVariant = payload.variant ?? current.variant;
    const nextQuantity = payload.quantity ?? current.quantity;
    const nextOrderCode = payload.orderCode ?? current.orderCode;
    const nextOrderAmount = payload.orderAmount ?? current.orderAmount;
    const nextDeliveryStatus = payload.deliveryStatus ?? current.deliveryStatus;
    const nextDeliveryCheckedAt = payload.deliveryCheckedAt ?? current.deliveryCheckedAt;
    const nextDeliveryTracking = payload.deliveryTracking ?? current.deliveryTracking;
    const nextProductName = payload.productName ?? current.productName ?? '';
    const nextCookie = payload.processingCookie ?? current.processingCookie;
    const nextAccount = payload.processingAccount ?? current.processingAccount;
    const nextOrderImage = payload.orderImage ?? current.orderImage ?? '';
    const nextAdminNote = payload.adminNote ?? current.adminNote ?? '';

    await sql`
      UPDATE orders
      SET order_public_id = ${nextOrderPublicId},
          recipient_name = ${nextRecipientName},
          phone = ${nextPhone},
          address_line = ${nextAddressLine},
          ward = ${nextWard},
          district = ${nextDistrict},
          province = ${nextProvince},
          voucher_type = ${nextVoucherType},
          product_link = ${nextProductLink},
          variant = ${nextVariant},
          quantity = ${nextQuantity},
          status = ${nextStatus},
          order_code = ${nextOrderCode},
          order_amount = ${nextOrderAmount},
          delivery_status = ${nextDeliveryStatus},
          delivery_checked_at = ${nextDeliveryCheckedAt},
          delivery_tracking = ${nextDeliveryTracking},
          product_name = ${nextProductName},
          processing_cookie = ${nextCookie},
          processing_account = ${nextAccount},
          order_image = ${nextOrderImage},
          admin_note = ${nextAdminNote}
      WHERE id = ${orderId}
    `;

    return {
      ...current,
      orderPublicId: nextOrderPublicId,
      recipientName: nextRecipientName,
      phone: nextPhone,
      addressLine: nextAddressLine,
      ward: nextWard,
      district: nextDistrict,
      province: nextProvince,
      voucherType: nextVoucherType,
      productLink: nextProductLink,
      variant: nextVariant,
      quantity: nextQuantity,
      status: nextStatus,
      orderCode: nextOrderCode,
      orderAmount: nextOrderAmount,
      deliveryStatus: nextDeliveryStatus,
      deliveryCheckedAt: nextDeliveryCheckedAt,
      deliveryTracking: nextDeliveryTracking,
      productName: nextProductName,
      processingCookie: nextCookie,
      processingAccount: nextAccount,
      orderImage: nextOrderImage,
      adminNote: nextAdminNote,
    };
  }

  const store = await readFileStore();
  const index = store.orders.findIndex((item) => item.id === orderId);
  if (index < 0) throw new Error('Không tìm thấy đơn hàng.');

  const current = store.orders[index];
  store.orders[index] = {
    ...current,
    orderPublicId: payload.orderPublicId ?? current.orderPublicId,
    recipientName: payload.recipientName ?? current.recipientName,
    phone: payload.phone ?? current.phone,
    addressLine: payload.addressLine ?? current.addressLine,
    ward: payload.ward ?? current.ward,
    district: payload.district ?? current.district,
    province: payload.province ?? current.province,
    voucherType: payload.voucherType ?? current.voucherType,
    productLink: payload.productLink ?? current.productLink,
    variant: payload.variant ?? current.variant,
    quantity: payload.quantity ?? current.quantity,
    status: payload.status ? normalizeStatus(payload.status) : current.status,
    orderCode: payload.orderCode ?? current.orderCode,
    orderAmount: payload.orderAmount ?? current.orderAmount,
    deliveryStatus: payload.deliveryStatus ?? current.deliveryStatus,
    deliveryCheckedAt: payload.deliveryCheckedAt ?? current.deliveryCheckedAt,
    deliveryTracking: payload.deliveryTracking ?? current.deliveryTracking,
    productName: payload.productName ?? current.productName,
    processingCookie: payload.processingCookie ?? current.processingCookie,
    processingAccount: payload.processingAccount ?? current.processingAccount,
    orderImage: payload.orderImage ?? current.orderImage,
    adminNote: payload.adminNote ?? current.adminNote,
  };
  await writeFileStore(store);
  return store.orders[index];
}

export async function getOrders() {
  ensurePersistentOrderStore();

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, order_public_id, username, recipient_name, phone, address_line, ward, district, province,
             voucher_type, product_link, variant, quantity, status, order_code, order_amount,
             delivery_status, delivery_checked_at, delivery_tracking, product_name, processing_cookie,
             processing_account, order_image, admin_note, created_at
      FROM orders
      ORDER BY created_at DESC
    `;
    return rows.map((row) => mapOrder(row as Record<string, unknown>));
  }

  const store = await readFileStore();
  return store.orders;
}

export async function getOrdersByUsername(username: string) {
  ensurePersistentOrderStore();

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, order_public_id, username, recipient_name, phone, address_line, ward, district, province,
             voucher_type, product_link, variant, quantity, status, order_code, order_amount,
             delivery_status, delivery_checked_at, delivery_tracking, product_name, processing_cookie,
             processing_account, order_image, admin_note, created_at
      FROM orders
      WHERE username = ${username}
      ORDER BY created_at DESC
    `;
    return rows.map((row) => mapOrder(row as Record<string, unknown>));
  }

  const store = await readFileStore();
  return store.orders.filter((item) => item.username === username);
}

export async function deleteOrder(orderId: string) {
  ensurePersistentOrderStore();

  if (sql) {
    await ensureDatabaseReady();
    const found = await sql`SELECT id FROM orders WHERE id = ${orderId} LIMIT 1`;
    if (found.length === 0) throw new Error('Không tìm thấy đơn hàng để xóa.');
    await sql`DELETE FROM orders WHERE id = ${orderId}`;
    return { ok: true };
  }

  const store = await readFileStore();
  const before = store.orders.length;
  store.orders = store.orders.filter((item) => item.id !== orderId);
  if (store.orders.length === before) throw new Error('Không tìm thấy đơn hàng để xóa.');
  await writeFileStore(store);
  return { ok: true };
}

export async function getUsers() {
  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`SELECT username, password_hash, password_plain, role, created_at FROM users ORDER BY created_at DESC`;
    return rows.map((row) => mapUser(row as Record<string, unknown>));
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  return [...store.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateUserRecord(username: string, payload: { passwordHash?: string; passwordPlain?: string; role?: 'admin' | 'customer' | 'ctv' }) {
  if (!username) throw new Error('Thiếu username.');

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`SELECT username, password_hash, password_plain, role, created_at FROM users WHERE username = ${username} LIMIT 1`;
    if (rows.length === 0) throw new Error('Không tìm thấy tài khoản.');

    const current = mapUser(rows[0] as Record<string, unknown>);
    const nextRole = payload.role ?? current.role;
    const nextPasswordHash = payload.passwordHash ?? current.passwordHash;
    const nextPasswordPlain = payload.passwordPlain ?? current.passwordPlain ?? '';

    await sql`
      UPDATE users
      SET role = ${nextRole}, password_hash = ${nextPasswordHash}, password_plain = ${nextPasswordPlain}
      WHERE username = ${username}
    `;

    return { ...current, role: nextRole, passwordHash: nextPasswordHash, passwordPlain: nextPasswordPlain };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const idx = store.users.findIndex((u) => u.username === username);
  if (idx < 0) throw new Error('Không tìm thấy tài khoản.');

  store.users[idx] = {
    ...store.users[idx],
    role: payload.role ?? store.users[idx].role,
    passwordHash: payload.passwordHash ?? store.users[idx].passwordHash,
    passwordPlain: payload.passwordPlain ?? store.users[idx].passwordPlain ?? '',
  };

  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;

  return store.users[idx];
}

export async function deleteUserRecord(username: string) {
  if (!username) throw new Error('Thiếu username.');

  const adminUsername = getAdminSeed().username;
  if (username === adminUsername) throw new Error('Không thể xóa tài khoản admin hệ thống.');

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`SELECT username, role FROM users WHERE username = ${username} LIMIT 1`;
    if (rows.length === 0) throw new Error('Không tìm thấy tài khoản.');
    const role = String((rows[0] as any).role || 'customer');
    if (role === 'admin') throw new Error('Không thể xóa tài khoản admin.');

    await sql`DELETE FROM users WHERE username = ${username}`;
    await sql`DELETE FROM user_profiles WHERE username = ${username}`;
    await sql`DELETE FROM admin_user_messages WHERE from_username = ${username} OR to_username = ${username}`;
    return { ok: true };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const target = store.users.find((u) => u.username === username);
  if (!target) throw new Error('Không tìm thấy tài khoản.');
  if (target.role === 'admin') throw new Error('Không thể xóa tài khoản admin.');

  store.users = store.users.filter((u) => u.username !== username);
  store.profiles = store.profiles.filter((item) => item.username !== username);
  store.messages = store.messages.filter((item) => item.from !== username && item.to !== username);

  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;

  return { ok: true };
}

export async function getUserProfile(username: string) {
  if (!username) throw new Error('Thiếu username.');

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT username, display_name, phone, address, email, zalo_number, bank_account, bank_name, bio, avatar_color, avatar_image, last_seen_announcements_at, updated_at
      FROM user_profiles
      WHERE username = ${username}
      LIMIT 1
    `;

    if (rows.length > 0) {
      return mapProfile(rows[0] as Record<string, unknown>);
    }

    const fallback = createDefaultProfile(username);
    await sql`
      INSERT INTO user_profiles (username, display_name, phone, address, email, zalo_number, bank_account, bank_name, bio, avatar_color, avatar_image, last_seen_announcements_at, updated_at)
      VALUES (${fallback.username}, ${fallback.displayName}, ${fallback.phone}, ${fallback.address}, ${fallback.email}, ${fallback.zaloNumber}, ${fallback.bankAccount}, ${fallback.bankName}, ${fallback.bio}, ${fallback.avatarColor}, ${fallback.avatarImage}, ${fallback.lastSeenAnnouncementsAt}, ${fallback.updatedAt})
    `;
    return fallback;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  let profile = store.profiles.find((item) => item.username === username) || null;
  if (!profile) {
    profile = createDefaultProfile(username);
    store.profiles.push(profile);
    if (process.env.NODE_ENV === 'development') await writeFileStore(store);
    else memoryStore.__portalStore = store;
  }
  return profile;
}

export async function updateUserProfile(
  username: string,
  payload: Partial<Pick<UserProfileRecord, 'displayName' | 'phone' | 'address' | 'email' | 'zaloNumber' | 'bankAccount' | 'bankName' | 'bio' | 'avatarColor' | 'avatarImage' | 'lastSeenAnnouncementsAt'>>
) {
  if (!username) throw new Error('Thiếu username.');

  const current = await getUserProfile(username);
  const next = {
    ...current,
    displayName: payload.displayName === undefined ? current.displayName : String(payload.displayName || '').trim(),
    phone: payload.phone === undefined ? current.phone : String(payload.phone || '').trim(),
    address: payload.address === undefined ? current.address : String(payload.address || '').trim(),
    email: payload.email === undefined ? current.email : String(payload.email || '').trim(),
    zaloNumber: payload.zaloNumber === undefined ? current.zaloNumber : String(payload.zaloNumber || '').trim(),
    bankAccount: payload.bankAccount === undefined ? current.bankAccount : String(payload.bankAccount || '').trim(),
    bankName: payload.bankName === undefined ? current.bankName : String(payload.bankName || '').trim(),
    bio: payload.bio === undefined ? current.bio : String(payload.bio || '').trim(),
    avatarColor: payload.avatarColor === undefined ? current.avatarColor : String(payload.avatarColor || '').trim(),
    avatarImage: payload.avatarImage === undefined ? current.avatarImage : String(payload.avatarImage || '').trim(),
    lastSeenAnnouncementsAt:
      payload.lastSeenAnnouncementsAt === undefined ? current.lastSeenAnnouncementsAt : String(payload.lastSeenAnnouncementsAt || '').trim(),
    updatedAt: new Date().toISOString(),
  };

  if (!next.displayName) next.displayName = username;
  if (!next.avatarColor) next.avatarColor = pickColorByUsername(username);

  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO user_profiles (username, display_name, phone, address, email, zalo_number, bank_account, bank_name, bio, avatar_color, avatar_image, last_seen_announcements_at, updated_at)
      VALUES (${next.username}, ${next.displayName}, ${next.phone}, ${next.address}, ${next.email}, ${next.zaloNumber}, ${next.bankAccount}, ${next.bankName}, ${next.bio}, ${next.avatarColor}, ${next.avatarImage}, ${next.lastSeenAnnouncementsAt}, ${next.updatedAt})
      ON CONFLICT (username) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          email = EXCLUDED.email,
          zalo_number = EXCLUDED.zalo_number,
          bank_account = EXCLUDED.bank_account,
          bank_name = EXCLUDED.bank_name,
          bio = EXCLUDED.bio,
          avatar_color = EXCLUDED.avatar_color,
          avatar_image = EXCLUDED.avatar_image,
          last_seen_announcements_at = EXCLUDED.last_seen_announcements_at,
          updated_at = EXCLUDED.updated_at
    `;
    return next;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const idx = store.profiles.findIndex((item) => item.username === username);
  if (idx >= 0) store.profiles[idx] = next;
  else store.profiles.push(next);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return next;
}

export async function getAnnouncements() {
  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, title, content, created_by, created_at
      FROM admin_announcements
      ORDER BY created_at DESC
      LIMIT 40
    `;
    return rows.map((row) => mapAnnouncement(row as Record<string, unknown>));
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  return [...store.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
}

export async function createAnnouncement(record: AnnouncementRecord) {
  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO admin_announcements (id, title, content, created_by, created_at)
      VALUES (${record.id}, ${record.title}, ${record.content}, ${record.createdBy}, ${record.createdAt})
    `;
    return record;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.announcements.unshift(record);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return record;
}

export async function deleteAnnouncement(announcementId: string) {
  if (!announcementId) throw new Error('Thiếu mã thông báo.');

  if (sql) {
    await ensureDatabaseReady();
    await sql`DELETE FROM admin_announcements WHERE id = ${announcementId}`;
    return { ok: true };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.announcements = store.announcements.filter((item) => item.id !== announcementId);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return { ok: true };
}

export async function markAnnouncementsSeen(username: string) {
  if (!username) return { ok: true };
  const now = new Date().toISOString();
  await updateUserProfile(username, { lastSeenAnnouncementsAt: now });
  return { ok: true };
}

export async function getUnreadAnnouncementsCount(username: string) {
  if (!username) return 0;
  const profile = await getUserProfile(username);
  const lastSeen = profile.lastSeenAnnouncementsAt || '';

  if (sql) {
    await ensureDatabaseReady();
    if (!lastSeen) {
      const rows = await sql`
        SELECT COUNT(*)::int AS total
        FROM admin_announcements
        WHERE created_by <> ${username}
      `;
      return Number((rows[0] as Record<string, unknown>)?.total || 0);
    }

    const rows = await sql`
      SELECT COUNT(*)::int AS total
      FROM admin_announcements
      WHERE created_by <> ${username}
        AND created_at > ${lastSeen}::timestamptz
    `;
    return Number((rows[0] as Record<string, unknown>)?.total || 0);
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  return store.announcements.filter((item) => item.createdBy !== username && (!lastSeen || item.createdAt > lastSeen)).length;
}

export async function renameUsername(oldUsername: string, newUsername: string) {
  const from = String(oldUsername || '').trim().toLowerCase();
  const to = String(newUsername || '').trim().toLowerCase();
  if (!from || !to) throw new Error('Thiếu username.');
  if (from === to) return { ok: true };

  if (sql) {
    await ensureDatabaseReady();
    const existing = await sql`SELECT username FROM users WHERE username = ${to} LIMIT 1`;
    if (existing.length > 0) throw new Error('Username mới đã tồn tại.');

    await sql`UPDATE users SET username = ${to} WHERE username = ${from}`;
    await sql`UPDATE user_profiles SET username = ${to}, display_name = CASE WHEN display_name = ${from} THEN ${to} ELSE display_name END WHERE username = ${from}`;
    await sql`UPDATE orders SET username = ${to} WHERE username = ${from}`;
    await sql`UPDATE admin_user_messages SET from_username = ${to} WHERE from_username = ${from}`;
    await sql`UPDATE admin_user_messages SET to_username = ${to} WHERE to_username = ${from}`;
    await sql`UPDATE admin_announcements SET created_by = ${to} WHERE created_by = ${from}`;
    return { ok: true };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  if (store.users.some((item) => item.username === to)) throw new Error('Username mới đã tồn tại.');

  store.users = store.users.map((item) => (item.username === from ? { ...item, username: to } : item));
  store.profiles = store.profiles.map((item) =>
    item.username === from
      ? {
          ...item,
          username: to,
          displayName: item.displayName === from ? to : item.displayName,
          updatedAt: new Date().toISOString(),
        }
      : item
  );
  store.orders = store.orders.map((item) => (item.username === from ? { ...item, username: to } : item));
  store.messages = store.messages.map((item) => ({
    ...item,
    from: item.from === from ? to : item.from,
    to: item.to === from ? to : item.to,
  }));
  store.announcements = store.announcements.map((item) => (item.createdBy === from ? { ...item, createdBy: to } : item));

  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return { ok: true };
}

export async function getMessages(options: { username: string; role: 'admin' | 'customer' | 'ctv'; target?: string }) {
  const { username, role, target } = options;

  if (sql) {
    await ensureDatabaseReady();
    if (role === 'admin' && target) {
      const rows = await sql`
        SELECT id, from_username, to_username, content, image_data, read_at, created_at
        FROM admin_user_messages
        WHERE (from_username = ${target} AND to_username = ${username}) OR (from_username = ${username} AND to_username = ${target})
        ORDER BY created_at ASC
        LIMIT 300
      `;
      return rows.map((row) => mapMessage(row as Record<string, unknown>));
    }

    if (role === 'admin') {
      const rows = await sql`
        SELECT id, from_username, to_username, content, image_data, read_at, created_at
        FROM admin_user_messages
        ORDER BY created_at ASC
        LIMIT 400
      `;
      return rows.map((row) => mapMessage(row as Record<string, unknown>));
    }

    const rows = await sql`
      SELECT id, from_username, to_username, content, image_data, read_at, created_at
      FROM admin_user_messages
      WHERE from_username = ${username} OR to_username = ${username}
      ORDER BY created_at ASC
      LIMIT 300
    `;
    return rows.map((row) => mapMessage(row as Record<string, unknown>));
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const all = [...store.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (role === 'admin' && target) {
    return all.filter((item) => (item.from === target && item.to === username) || (item.from === username && item.to === target));
  }
  if (role === 'admin') return all;
  return all.filter((item) => item.from === username || item.to === username);
}

export async function createMessage(record: MessageRecord) {
  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO admin_user_messages (id, from_username, to_username, content, image_data, read_at, created_at)
      VALUES (${record.id}, ${record.from}, ${record.to}, ${record.content}, ${record.imageData || ''}, ${record.readAt || null}, ${record.createdAt})
    `;
    return record;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.messages.push(record);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return record;
}

export async function markMessagesRead(options: { username: string; from?: string }) {
  const { username, from } = options;
  const now = new Date().toISOString();

  if (sql) {
    await ensureDatabaseReady();
    if (from) {
      await sql`
        UPDATE admin_user_messages
        SET read_at = ${now}
        WHERE to_username = ${username} AND from_username = ${from} AND read_at IS NULL
      `;
      return { ok: true };
    }
    await sql`
      UPDATE admin_user_messages
      SET read_at = ${now}
      WHERE to_username = ${username} AND read_at IS NULL
    `;
    return { ok: true };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.messages = store.messages.map((item) => {
    if (item.to !== username) return item;
    if (from && item.from !== from) return item;
    if (item.readAt) return item;
    return { ...item, readAt: now };
  });
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return { ok: true };
}

export async function getUnreadMessageCount(username: string) {
  if (!username) return 0;

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT COUNT(*)::int AS total
      FROM admin_user_messages
      WHERE to_username = ${username} AND read_at IS NULL
    `;
    return Number((rows[0] as Record<string, unknown>)?.total || 0);
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  return store.messages.filter((item) => item.to === username && !item.readAt).length;
}

export async function getUnreadMessageCountBySender(username: string) {
  if (!username) return {} as Record<string, number>;

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT from_username, COUNT(*)::int AS total
      FROM admin_user_messages
      WHERE to_username = ${username} AND read_at IS NULL
      GROUP BY from_username
    `;
    const mapped: Record<string, number> = {};
    for (const row of rows as Record<string, unknown>[]) {
      mapped[String(row.from_username || '')] = Number(row.total || 0);
    }
    return mapped;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const mapped: Record<string, number> = {};
  for (const item of store.messages) {
    if (item.to !== username || item.readAt) continue;
    mapped[item.from] = (mapped[item.from] || 0) + 1;
  }
  return mapped;
}

export async function getVouchers() {
  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, label, price, active, created_at, updated_at
      FROM vouchers
      ORDER BY created_at DESC
    `;
    return rows.map((row) => mapVoucher(row as Record<string, unknown>));
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  return [...store.vouchers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createVoucher(record: VoucherRecord) {
  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO vouchers (id, label, price, active, created_at, updated_at)
      VALUES (${record.id}, ${record.label}, ${record.price}, ${record.active}, ${record.createdAt}, ${record.updatedAt})
    `;
    return record;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  if (store.vouchers.some((item) => item.id === record.id)) throw new Error('Mã voucher đã tồn tại.');
  store.vouchers.push(record);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return record;
}

export async function updateVoucher(voucherId: string, payload: Partial<Pick<VoucherRecord, 'label' | 'price' | 'active'>>) {
  if (!voucherId) throw new Error('Thiếu mã voucher.');
  const now = new Date().toISOString();

  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT id, label, price, active, created_at, updated_at
      FROM vouchers
      WHERE id = ${voucherId}
      LIMIT 1
    `;
    if (rows.length === 0) throw new Error('Không tìm thấy voucher.');
    const current = mapVoucher(rows[0] as Record<string, unknown>);

    const next = {
      ...current,
      label: payload.label === undefined ? current.label : String(payload.label || '').trim(),
      price: payload.price === undefined ? current.price : Math.max(0, Number(payload.price || 0)),
      active: payload.active === undefined ? current.active : Boolean(payload.active),
      updatedAt: now,
    };

    await sql`
      UPDATE vouchers
      SET label = ${next.label},
          price = ${next.price},
          active = ${next.active},
          updated_at = ${next.updatedAt}
      WHERE id = ${voucherId}
    `;
    return next;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  const idx = store.vouchers.findIndex((item) => item.id === voucherId);
  if (idx < 0) throw new Error('Không tìm thấy voucher.');
  const current = store.vouchers[idx];
  store.vouchers[idx] = {
    ...current,
    label: payload.label === undefined ? current.label : String(payload.label || '').trim(),
    price: payload.price === undefined ? current.price : Math.max(0, Number(payload.price || 0)),
    active: payload.active === undefined ? current.active : Boolean(payload.active),
    updatedAt: now,
  };
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return store.vouchers[idx];
}

export async function deleteVoucher(voucherId: string) {
  if (!voucherId) throw new Error('Thiếu mã voucher.');

  if (sql) {
    await ensureDatabaseReady();
    await sql`DELETE FROM vouchers WHERE id = ${voucherId}`;
    return { ok: true };
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.vouchers = store.vouchers.filter((item) => item.id !== voucherId);
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return { ok: true };
}

export async function getAppSettings() {
  if (sql) {
    await ensureDatabaseReady();
    const rows = await sql`
      SELECT order_form_enabled, updated_at
      FROM app_settings
      WHERE id = 1
      LIMIT 1
    `;
    if (rows.length > 0) {
      return {
        orderFormEnabled: Boolean((rows[0] as Record<string, unknown>).order_form_enabled),
        updatedAt: new Date(String((rows[0] as Record<string, unknown>).updated_at || Date.now())).toISOString(),
      };
    }
    const fallback = createDefaultSettings();
    await sql`
      INSERT INTO app_settings (id, order_form_enabled, updated_at)
      VALUES (1, ${fallback.orderFormEnabled}, ${fallback.updatedAt})
    `;
    return fallback;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  if (!store.settings) store.settings = createDefaultSettings();
  return store.settings;
}

export async function updateAppSettings(payload: Partial<Pick<AppSettingsRecord, 'orderFormEnabled'>>) {
  const current = await getAppSettings();
  const next = {
    ...current,
    orderFormEnabled: payload.orderFormEnabled === undefined ? current.orderFormEnabled : Boolean(payload.orderFormEnabled),
    updatedAt: new Date().toISOString(),
  };

  if (sql) {
    await ensureDatabaseReady();
    await sql`
      INSERT INTO app_settings (id, order_form_enabled, updated_at)
      VALUES (1, ${next.orderFormEnabled}, ${next.updatedAt})
      ON CONFLICT (id) DO UPDATE
      SET order_form_enabled = EXCLUDED.order_form_enabled,
          updated_at = EXCLUDED.updated_at
    `;
    return next;
  }

  const store = process.env.NODE_ENV === 'development' ? await readFileStore() : await readMemoryStore();
  store.settings = next;
  if (process.env.NODE_ENV === 'development') await writeFileStore(store);
  else memoryStore.__portalStore = store;
  return next;
}














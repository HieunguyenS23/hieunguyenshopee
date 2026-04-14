'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { UserRole } from '@/lib/types';

type Props = {
  isAdmin: boolean;
  role: UserRole;
};

type UnreadPayload = {
  unreadMessages: number;
  unreadAnnouncements: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: string;
  section: string;
  badge?: number;
};

export function LeftTagbar({ isAdmin, role }: Props) {
  const win = typeof window !== 'undefined' ? (window as any) : null;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<UnreadPayload>({ unreadMessages: 0, unreadAnnouncements: 0 });
  const unreadTotal = Number(unread.unreadMessages || 0) + Number(unread.unreadAnnouncements || 0);

  const closeDrawer = () => setOpen(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) return;
        setUnread({
          unreadMessages: Number(data.unreadMessages || 0),
          unreadAnnouncements: Number(data.unreadAnnouncements || 0),
        });
      } catch {
        setUnread({ unreadMessages: 0, unreadAnnouncements: 0 });
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((prev) => !prev);
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('app-drawer:toggle', onToggle);
    window.addEventListener('app-drawer:open', onOpen);
    window.addEventListener('app-drawer:close', onClose);
    document.addEventListener('app-drawer:toggle', onToggle as EventListener);
    document.addEventListener('app-drawer:open', onOpen as EventListener);
    document.addEventListener('app-drawer:close', onClose as EventListener);
    window.addEventListener('keydown', onKeydown);
    if (win) {
      win.__toggleAppDrawer = onToggle;
      win.__openAppDrawer = onOpen;
      win.__closeAppDrawer = onClose;
    }

    return () => {
      window.removeEventListener('app-drawer:toggle', onToggle);
      window.removeEventListener('app-drawer:open', onOpen);
      window.removeEventListener('app-drawer:close', onClose);
      document.removeEventListener('app-drawer:toggle', onToggle as EventListener);
      document.removeEventListener('app-drawer:open', onOpen as EventListener);
      document.removeEventListener('app-drawer:close', onClose as EventListener);
      window.removeEventListener('keydown', onKeydown);
      if (win) {
        delete win.__toggleAppDrawer;
        delete win.__openAppDrawer;
        delete win.__closeAppDrawer;
      }
    };
  }, []);

  const links: NavItem[] = isAdmin
    ? [
        { href: '/admin/lookup', label: 'Kiểm tra vận đơn', icon: '📦', section: 'Cookie & xác thực' },
        { href: '/admin/orders', label: 'Quản lí đơn', icon: '📋', section: 'Cookie & xác thực' },

        { href: '/admin/vouchers', label: 'Quản lí voucher', icon: '🎟', section: 'Thao tác Shop' },
        { href: '/admin/save-voucher', label: 'Lưu mã voucher', icon: '💾', section: 'Thao tác Shop' },
        { href: '/mmo-services', label: 'Dịch vụ MMO', icon: '💎', section: 'Thao tác Shop' },
        { href: '/admin/add-mail', label: 'Thêm Mail', icon: '✉️', section: 'Thao tác Shop' },
        { href: '/admin/read-mail', label: 'Đọc Mail', icon: '📨', section: 'Thao tác Shop' },
        { href: '/admin/cookie-tools', label: 'Thao tác cookie', icon: '🍪', section: 'Thao tác Shop' },

        { href: '/admin/users', label: 'Quản lí tài khoản', icon: '👤', section: 'Quản trị', badge: unreadTotal },
        { href: '/orders/history', label: 'Lịch sử đơn', icon: '🕘', section: 'Quản trị' },
        { href: '/profile', label: 'Hồ sơ', icon: '🪪', section: 'Quản trị' },
        { href: '/announcements', label: 'Thông báo', icon: '🔔', section: 'Quản trị' },
      ]
    : [
        { href: '/orders/new', label: 'Lên đơn', icon: '📝', section: 'Khách hàng' },
        { href: '/orders/history', label: 'Lịch sử', icon: '🕘', section: 'Khách hàng' },
        ...(role === 'ctv' ? [{ href: '/admin/lookup', label: 'Kiểm tra vận đơn', icon: '📦', section: 'Khách hàng' }] : []),
        { href: '/profile', label: 'Hồ sơ', icon: '🪪', section: 'Khách hàng' },
        { href: '/announcements', label: 'Thông báo', icon: '🔔', section: 'Khách hàng', badge: unreadTotal },
      ];

  const grouped = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of links) {
      const bucket = map.get(item.section) || [];
      bucket.push(item);
      map.set(item.section, bucket);
    }
    return Array.from(map.entries());
  }, [links]);

  return (
    <>
      <div className={`app-drawer-overlay ${open ? 'show' : ''}`} onClick={closeDrawer} />
      <aside className={`app-drawer ${open ? 'open' : 'closed'}`}>
        <div className="app-drawer-head">
          <strong>Dịch vụ Shoppe</strong>
          <button type="button" className="app-drawer-close" onClick={closeDrawer} aria-label="Đóng menu">×</button>
        </div>

        <nav className="app-drawer-nav">
          {grouped.map(([section, items]) => (
            <div key={section} className="app-drawer-group">
              <p className="app-drawer-title">{section}</p>
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`app-drawer-link ${active ? 'is-active' : ''}`}
                    onClick={closeDrawer}
                  >
                    <span className="app-drawer-icon" aria-hidden>{item.icon}</span>
                    <span className="app-drawer-label">{item.label}</span>
                    {Number(item.badge || 0) > 0 ? <span className="app-drawer-badge">{item.badge! > 99 ? '99+' : item.badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}




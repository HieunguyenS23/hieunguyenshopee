import { requireSession } from '@/lib/session';
import { MobileTabbar } from '@/components/mobile-tabbar';
import { LeftTagbar } from '@/components/left-tagbar';

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const isAdmin = session.role === 'admin';
  const role = session.role;

  return (
    <main className="app-shell">
      <div className={`app-frame app-frame-with-sidebar ${isAdmin ? 'app-frame-admin' : ''}`}>
        <LeftTagbar isAdmin={isAdmin} role={role} />
        <div className="content-area">
          <MobileTabbar isAdmin={isAdmin} role={role} username={session.username} />
          {children}
        </div>
      </div>
    </main>
  );
}

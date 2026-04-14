import { requireAdminOrCtv } from '@/lib/session';
import { MmoChatgptCenter } from '@/components/mmo-chatgpt-center';

export default async function MmoChatgptPage() {
  await requireAdminOrCtv();

  return (
    <main className="mmo-page-root">
      <div className="mmo-page-shell">
        <MmoChatgptCenter />
      </div>
    </main>
  );
}

import { requireAdmin } from '@/lib/session';
import { MmoServicesCenter } from '@/components/mmo-services-center';

export default async function MmoServicesPage() {
  await requireAdmin();

  return (
    <main className="mmo-page-root">
      <div className="mmo-page-shell">
        <MmoServicesCenter />
      </div>
    </main>
  );
}

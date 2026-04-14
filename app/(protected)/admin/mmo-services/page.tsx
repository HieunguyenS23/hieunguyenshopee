import { requireAdmin } from '@/lib/session';
import { MmoServicesCenter } from '@/components/mmo-services-center';

export default async function AdminMmoServicesPage() {
  await requireAdmin();

  return (
    <div className="page-stack page-stack-spaced">
      <MmoServicesCenter />
    </div>
  );
}

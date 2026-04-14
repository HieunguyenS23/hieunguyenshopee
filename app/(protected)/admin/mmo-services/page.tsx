import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/session';

export default async function AdminMmoServicesPage() {
  await requireAdmin();
  redirect('/mmo-services');
}

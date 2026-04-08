import { requireAdmin } from '@/lib/session';
import { CookieToolsCenter } from '@/components/cookie-tools-center';

export default async function AdminCookieToolsPage() {
  await requireAdmin();

  return (
    <div className="page-stack page-stack-spaced">
      <CookieToolsCenter />
    </div>
  );
}

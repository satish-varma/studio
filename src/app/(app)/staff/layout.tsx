
import AppLayout from '@/app/(app)/layout';
import type { ReactNode } from 'react';

export default function StaffManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}

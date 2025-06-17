
import AppLayout from '@/app/(app)/layout';
import type { ReactNode } from 'react';

export default function FoodStallLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}

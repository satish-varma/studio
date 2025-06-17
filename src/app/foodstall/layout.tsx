import AppLayout from '@/app/(app)/layout';

export default function FoodStallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}

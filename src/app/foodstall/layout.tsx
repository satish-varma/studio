// This layout will wrap all pages within the /foodstall route segment.
// For now, it re-uses the main AppLayout.
// You can customize this later if the food stall section needs a different overall structure
// (e.g., a different sidebar, header, or specific context providers).

import AppLayout from '@/app/(app)/layout'; // Reuse the main app layout

export default function FoodStallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}

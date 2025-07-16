
import type { ReactNode } from 'react';

// This layout file ensures that all pages under /staff share a common structure,
// but since it's nested within the main (app) layout, it should not
// re-render the main AppLayout. It simply passes its children through.
export default function StaffManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  // We don't wrap children in AppLayout here because the parent layout
  // at /src/app/(app)/layout.tsx already does.
  return <>{children}</>;
}

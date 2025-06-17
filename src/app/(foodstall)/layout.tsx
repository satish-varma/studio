
// THIS FILE IS PART OF A CONFLICTING ROUTE GROUP (foodstall) AND SHOULD BE MANUALLY DELETED.
//
// TO FIX THE "You cannot have two parallel pages that resolve to the same path" ERROR:
// 1. Ensure all intended food stall pages are under `/src/app/foodstall/...` (no parentheses).
// 2. Manually delete the entire `/src/app/(foodstall)/` directory from your project.
//
// This file's content is intentionally minimal. The correct layout is `/src/app/foodstall/layout.tsx`.
import type { ReactNode } from 'react';

export default function ConflictingFoodstallLayout({ children }: { children: ReactNode }) {
  return <>{children}</>; // Minimal passthrough
}

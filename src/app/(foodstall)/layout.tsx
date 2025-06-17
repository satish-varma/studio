
// ERROR: THIS FILE IS THE LAYOUT FOR A CONFLICTING ROUTE GROUP (foodstall)
// AND IS LIKELY CONTRIBUTING TO A "You cannot have two parallel pages that resolve to the same path" ERROR.
//
// TO FIX THIS:
// 1. ENSURE THE CORRECT LAYOUT (/src/app/foodstall/layout.tsx - WITHOUT PARENTHESES) IS USED.
// 2. MANUALLY DELETE THE ENTIRE /src/app/(foodstall)/ DIRECTORY FROM YOUR PROJECT.
//
// This file's content is intentionally minimal to try and avoid build errors.
import type { ReactNode } from 'react';

export default function ConflictingFoodstallLayout({ children }: { children: ReactNode }) {
  return <>{children}</>; // Minimal passthrough
}

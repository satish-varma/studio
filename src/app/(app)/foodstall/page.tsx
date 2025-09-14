
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page just redirects to the foodstall dashboard.
export default function FoodStallPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/foodstall/dashboard');
  }, [router]);

  return null;
}

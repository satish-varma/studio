
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page just redirects to the staff dashboard.
export default function StaffPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff/dashboard');
  }, [router]);

  return null;
}

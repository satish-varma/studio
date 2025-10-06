
"use client";

import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { AppHeaderContent } from '@/components/layout/AppHeaderContent';
import BottomNavBar from '@/components/layout/BottomNavBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from '@/components/ui/toaster';

function PivotLayoutContent({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const pageVariants = {
    initial: { opacity: 0, y: 10 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -10 },
  };

  const pageTransition = {
    type: "tween",
    ease: "anticipate",
    duration: 0.4,
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
        <AppHeaderContent />
        <main className="flex-1 overflow-y-auto pb-28 md:pb-0">
          <motion.div
            key={pathname}
            initial="initial"
            animate="in"
            variants={pageVariants}
            transition={pageTransition}
            className="p-4 sm:p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </main>
        <BottomNavBar />
      </div>
    </SidebarProvider>
  );
}

// This is the root layout for the (pivot) route group.
// It wraps the content in all necessary global providers.
export default function PivotLayout({ children }: { children: ReactNode }) {
  return (
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
           <PivotLayoutContent>{children}</PivotLayoutContent>
           <Toaster />
        </AuthProvider>
      </ThemeProvider>
  );
}

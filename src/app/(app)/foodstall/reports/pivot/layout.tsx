"use client";

import type { ReactNode } from 'react';
import { AppHeaderContent } from '@/components/layout/AppHeaderContent';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import BottomNavBar from '@/components/layout/BottomNavBar';
import { SidebarProvider } from '@/components/ui/sidebar';

// This new layout provides a full-width view by omitting the main sidebar.
export default function PivotReportLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

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
        <div className="flex-1 flex flex-col overflow-hidden h-screen w-full">
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

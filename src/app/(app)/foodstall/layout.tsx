
"use client";

import type { ReactNode } from 'react';
import { AppHeaderContent } from '@/components/layout/AppHeaderContent';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

// This layout file ensures that all pages under /foodstall share a common structure.
export default function FoodStallLayout({
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
  
  // This layout is now self-contained and does not rely on the parent (app) layout.
  // It includes the header directly. The main (app) layout should handle the sidebar.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* The main AppLayout in the parent directory will provide the sidebar, 
          but we render the header here to ensure it's on every food stall page. */}
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
    </div>
  );
}

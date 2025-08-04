
"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, LogOut } from 'lucide-react'; 
import { motion } from "framer-motion";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { AppSidebarNav } from "@/components/layout/AppSidebarNav";
import { AppHeaderContent } from "@/components/layout/AppHeaderContent";
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import BottomNavBar from '@/components/layout/BottomNavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null; 
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
      <div className="flex h-screen w-full bg-background">
        {/* Desktop Sidebar */}
        <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border hidden md:flex">
          <SidebarHeader className="p-4 flex flex-col items-center group-data-[collapsible=icon]:hidden">
            <Link href="/dashboard" className="flex items-center gap-2 mb-4">
              <Image 
                src="https://placehold.co/80x80.png?text=SS"
                alt="StallSync Logo"
                data-ai-hint="logo abstract"
                width={40}
                height={40}
                className="rounded-md"
              />
              <h1 className="text-2xl font-semibold text-sidebar-primary">StallSync</h1>
            </Link>
          </SidebarHeader>
          <SidebarHeader className="p-2 hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
            <Link href="/dashboard">
              <Image 
                  src="https://placehold.co/80x80.png?text=SS"
                  alt="StallSync Logo Small"
                  data-ai-hint="logo abstract"
                  width={32}
                  height={32}
                  className="rounded-md"
                />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <AppSidebarNav />
          </SidebarContent>
          <SidebarFooter className="p-4 mt-auto group-data-[collapsible=icon]:hidden">
            <Button variant="outline" onClick={signOutUser} className="w-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              Sign Out
            </Button>
          </SidebarFooter>
           <SidebarFooter className="p-2 mt-auto hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
            <Button variant="ghost" size="icon" onClick={signOutUser} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut className="h-5 w-5" />
            </Button>
          </SidebarFooter>
        </Sidebar>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
      </div>
    </SidebarProvider>
  );
}

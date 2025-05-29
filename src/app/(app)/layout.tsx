"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebarNav } from "@/components/layout/AppSidebarNav";
import { AppHeaderContent } from "@/components/layout/AppHeaderContent";
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();

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
    // This should ideally not be reached if useEffect redirect works, but as a fallback.
    return null; 
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
        <SidebarHeader className="p-4 flex flex-col items-center group-data-[collapsible=icon]:hidden">
           <Link href="/dashboard" className="flex items-center gap-2 mb-4">
            <Image 
              src="https://placehold.co/80x80.png?text=SS" // Placeholder for StallSync logo
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
      <SidebarInset className="flex flex-col">
        <AppHeaderContent />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Dummy LogOut icon if not imported from lucide-react directly
const LogOut = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
);


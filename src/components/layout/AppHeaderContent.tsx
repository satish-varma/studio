
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserNav } from "@/components/layout/UserNav";
import Link from "next/link";
import Image from "next/image";
import SiteStallSelector from '@/components/context/SiteStallSelector';

export function AppHeaderContent() {
  return (
    <div className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-4">
        <SidebarTrigger className="md:hidden" />
         <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <Image 
              src="https://placehold.co/60x60.png?text=SS" // Placeholder for StallSync logo
              alt="StallSync Logo"
              data-ai-hint="logo abstract"
              width={32}
              height={32}
              className="rounded-md"
            />
          </Link>
          <div className="block">
            <SiteStallSelector />
          </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="md:hidden">
          <UserNav />
        </div>
        <div className="hidden md:flex md:items-center md:gap-4">
          <UserNav />
        </div>
      </div>
    </div>
  );
}

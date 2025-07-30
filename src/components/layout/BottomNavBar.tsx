
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LucideIcon,
  Plus,
  IndianRupee,
  ClipboardPlus,
  CalendarCheck,
  HandCoins,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "../ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: ('staff' | 'manager' | 'admin')[];
}

const navItems: NavItem[] = [
  { href: "/foodstall/expenses/record", label: "Add Expense", icon: ClipboardPlus, roles: ['staff', 'manager', 'admin'] },
  { href: "/staff/attendance", label: "Attendance", icon: CalendarCheck, roles: ['manager', 'admin'] },
  { href: "/staff/advances", label: "Advance", icon: HandCoins, roles: ['manager', 'admin'] },
  { href: "/staff/payroll", label: "Payroll", icon: IndianRupee, roles: ['manager', 'admin'] },
  { href: "/foodstall/activity-log", label: "FS Activity", icon: FileText, roles: ['admin'] },
];

const FAB_ITEMS = [
    { href: '/items/new', label: 'Add Stock Item', roles: ['staff', 'manager', 'admin'] },
    { href: '/sales/record', label: 'Record Sale', roles: ['staff', 'manager', 'admin'] },
    { href: '/foodstall/expenses/record', label: 'Add Expense', roles: ['staff', 'manager', 'admin'] },
    { href: '/users', label: 'Add New User', roles: ['admin'] },
  ];

export default function BottomNavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const userRole = user?.role;

  if (!userRole) {
    return null;
  }

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));
  const filteredFabItems = FAB_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t z-50">
      <div className="flex justify-around items-center h-full">
        {filteredNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href) && (item.href !== '/dashboard' || pathname === '/dashboard');
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center flex-1 h-full p-1 text-center">
              <item.icon className={cn("h-6 w-6 mb-1 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-xs transition-colors leading-tight", isActive ? "text-primary font-semibold" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="absolute bottom-20 right-4 h-14 w-14 rounded-full shadow-lg" size="icon">
                    <Plus className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mb-2">
                 {filteredFabItems.map((item) => (
                    <DropdownMenuItem key={item.href} onSelect={() => router.push(item.href)}>
                        {item.label}
                    </DropdownMenuItem>
                 ))}
            </DropdownMenuContent>
        </DropdownMenu>
    </div>
  );
}

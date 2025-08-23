
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LucideIcon,
  Plus,
  UserPlus,
  Package,
  IndianRupee,
  Utensils,
  FileText,
  CalendarCheck,
  HandCoins,
  LayoutDashboard,
  ShoppingCart,
  Briefcase
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
  exactMatch?: boolean;
}

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['staff', 'manager', 'admin'], exactMatch: true },
    { href: "/items", label: "Stock", icon: ShoppingCart, roles: ['staff', 'manager', 'admin'] },
    { href: "/foodstall/dashboard", label: "Food Stall", icon: Utensils, roles: ['staff', 'manager', 'admin'] },
    { href: "/staff/dashboard", label: "Staff", icon: Briefcase, roles: ['manager', 'admin'] },
];

const FAB_ITEMS = [
    { href: '/sales/record', label: 'Record Stock Sale', roles: ['staff', 'manager', 'admin'], icon: IndianRupee },
    { href: '/items/new', label: 'Add Stock Item', roles: ['staff', 'manager', 'admin'], icon: Package },
    { href: '/foodstall/expenses/record', label: 'Add Food Expense', roles: ['staff', 'manager', 'admin'], icon: Utensils },
    { href: '/staff/advances', label: 'Pay Advance', roles: ['manager', 'admin'], icon: HandCoins },
    { href: '/users', label: 'Add New User', roles: ['admin'], icon: UserPlus },
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
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t z-40">
        <div className="flex justify-around items-center h-full">
          {filteredNavItems.map((item) => {
            const isActive = item.exactMatch ? pathname === item.href : pathname.startsWith(item.href);
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
      </div>
      <div className="md:hidden fixed bottom-[4.5rem] right-4 z-50">
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="h-14 w-14 rounded-full shadow-lg" size="icon">
                    <Plus className="h-6 w-6" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mb-2">
                 {filteredFabItems.map((item) => (
                    <DropdownMenuItem key={item.href} onSelect={() => router.push(item.href)}>
                        {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                        {item.label}
                    </DropdownMenuItem>
                 ))}
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

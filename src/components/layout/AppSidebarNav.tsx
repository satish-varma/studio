"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  Users,
  Settings,
  LucideIcon,
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[]; // Roles that can see this item
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['staff', 'manager', 'admin'] },
  { href: "/items", label: "Stock Items", icon: Package, roles: ['staff', 'manager', 'admin'] },
  { href: "/sales/record", label: "Record Sale", icon: ShoppingCart, roles: ['staff', 'manager', 'admin'] },
  { href: "/sales/history", label: "Sales History", icon: History, roles: ['staff', 'manager', 'admin'] }, // Filtering by staff might be manager only
  { href: "/users", label: "User Management", icon: Users, roles: ['admin'] }, // Example admin-only
  { href: "/settings", label: "Settings", icon: Settings, roles: ['manager', 'admin'] }, // Example manager/admin
];

export function AppSidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = user?.role || 'staff'; // Default to staff if role is undefined

  const filteredNavItems = navItems.filter(item => 
    !item.roles || item.roles.includes(userRole)
  );

  return (
    <SidebarMenu>
      {filteredNavItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href} passHref legacyBehavior>
            <SidebarMenuButton
              isActive={pathname.startsWith(item.href)}
              tooltip={{ children: item.label, className: "bg-primary text-primary-foreground" }}
              className="justify-start"
            >
              <item.icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

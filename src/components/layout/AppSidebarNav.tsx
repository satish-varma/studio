
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
  UserCircle,
  LifeBuoy,
  Building, 
  BarChart3, 
  FileText, 
  UtensilsCrossed, 
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types";

interface NavSubItem {
  href: string;
  label: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[]; 
  exactMatch?: boolean;
  subItems?: NavSubItem[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['staff', 'manager', 'admin'], exactMatch: true },
  { href: "/items", label: "Stock Items", icon: Package, roles: ['staff', 'manager', 'admin'] },
  { href: "/sales/record", label: "Record Sale", icon: ShoppingCart, roles: ['staff', 'manager', 'admin'] },
  { href: "/sales/history", label: "Sales History", icon: History, roles: ['staff', 'manager', 'admin'] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ['manager', 'admin'] },
  { 
    href: "/foodstall/dashboard", 
    label: "Food Stall Management", 
    icon: UtensilsCrossed, 
    roles: ['staff', 'manager', 'admin'],
    subItems: [
      { href: "/foodstall/sales/record", label: "Record Sale" },
      { href: "/foodstall/expenses/record", label: "Record Expense" },
      { href: "/foodstall/reports", label: "View Reports" },
    ]
  },
  { href: "/users", label: "User Management", icon: Users, roles: ['admin'] },
  { href: "/admin/sites", label: "Manage Sites & Stalls", icon: Building, roles: ['admin'] },
  { href: "/admin/activity-log", label: "Activity Log", icon: FileText, roles: ['admin'] },
  { href: "/profile", label: "My Profile", icon: UserCircle, roles: ['staff', 'manager', 'admin'] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ['manager', 'admin'] },
  { href: "/support", label: "Support", icon: LifeBuoy, roles: ['staff', 'manager', 'admin'] },
];

export function AppSidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const userRole = user?.role || 'staff'; 

  const filteredNavItems = navItems.filter(item =>
    !item.roles || item.roles.includes(userRole)
  );

  return (
    <SidebarMenu>
      {filteredNavItems.map((item) => {
        const isSubItemActive = item.subItems?.some(sub => pathname.startsWith(sub.href)) ?? false;
        const isActive = item.exactMatch ? pathname === item.href : (pathname.startsWith(item.href) || isSubItemActive);
        
        return (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href} passHref legacyBehavior>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={{ children: item.label, className: "bg-primary text-primary-foreground" }}
                className="justify-start"
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
            {item.subItems && isActive && (
              <SidebarMenuSub>
                {item.subItems.map((subItem) => {
                  const isSubActive = pathname.startsWith(subItem.href);
                  return (
                    <SidebarMenuSubItem key={subItem.href}>
                      <Link href={subItem.href} passHref legacyBehavior>
                        <SidebarMenuSubButton isActive={isSubActive}>
                          <span>{subItem.label}</span>
                        </SidebarMenuSubButton>
                      </Link>
                    </SidebarMenuSubItem>
                  )
                })}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

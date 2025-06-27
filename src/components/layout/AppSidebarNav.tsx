
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Settings,
  LucideIcon,
  UserCircle,
  LifeBuoy,
  UtensilsCrossed, 
  ChevronDown,
  ShieldAlert,
  PlusCircle,
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
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface NavSubItem {
  href: string;
  label: string;
  roles?: UserRole[];
  icon?: LucideIcon;
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
  
  { 
    href: "/items", 
    label: "Stock & Sales", 
    icon: ShoppingCart, 
    roles: ['staff', 'manager', 'admin'],
    subItems: [
      { href: "/items", label: "Stock Items", roles: ['staff', 'manager', 'admin'] },
      { href: "/sales/record", label: "Record Sale", roles: ['staff', 'manager', 'admin'] },
      { href: "/sales/history", label: "Sales History", roles: ['staff', 'manager', 'admin'] },
      { href: "/reports", label: "Sales Reports", roles: ['manager', 'admin'] },
      { href: "/admin/activity-log", label: "Stock Activity Log", roles: ['admin'] },
    ]
  },
  
  { 
    href: "/foodstall",
    label: "Food Stall", 
    icon: UtensilsCrossed, 
    roles: ['staff', 'manager', 'admin'],
    subItems: [
      { href: "/foodstall/dashboard", label: "Dashboard", roles: ['staff', 'manager', 'admin'] },
      { href: "/foodstall/expenses/record", label: "Add Expense", roles: ['staff', 'manager', 'admin'], icon: PlusCircle },
      { href: "/foodstall/sales/record", label: "Add Sales", roles: ['staff', 'manager', 'admin'], icon: PlusCircle },
      { href: "/foodstall/sales", label: "Sales Summaries", roles: ['staff', 'manager', 'admin'] },
      { href: "/foodstall/expenses", label: "Expense History", roles: ['staff', 'manager', 'admin'] },
      { href: "/foodstall/reports", label: "Reports", roles: ['manager', 'admin'] },
      { href: "/foodstall/activity-log", label: "Activity Log", roles: ['manager', 'admin'] },
    ]
  },

  {
    href: "/users",
    label: "Administration",
    icon: ShieldAlert,
    roles: ['admin'],
    subItems: [
        { href: "/users", label: "User Management", roles: ['admin'] },
        { href: "/admin/sites", label: "Manage Sites & Stalls", roles: ['admin'] },
    ]
  },

  { href: "/profile", label: "My Profile", icon: UserCircle, roles: ['staff', 'manager', 'admin'] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ['manager', 'admin'] },
  { href: "/support", label: "Support", icon: LifeBuoy, roles: ['staff', 'manager', 'admin'] },
];


export function AppSidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeParent = navItems.find(item => item.subItems && pathname.startsWith(item.href) && !item.exactMatch);
    if (activeParent) {
      setOpenMenus(prev => {
        if (prev.has(activeParent.href)) return prev;
        const newSet = new Set(prev);
        newSet.add(activeParent.href);
        return newSet;
      });
    }
  }, [pathname]);

  const toggleMenu = (href: string) => {
    setOpenMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(href)) {
        newSet.delete(href);
      } else {
        newSet.add(href);
      }
      return newSet;
    });
  };

  const userRole = user?.role || 'staff';

  const filteredNavItems = navItems.filter(item =>
    !item.roles || item.roles.includes(userRole)
  );

  return (
    <SidebarMenu>
      {filteredNavItems.map((item) => {
        const hasSubItems = !!item.subItems;
        const isActive = item.exactMatch ? pathname === item.href : pathname.startsWith(item.href);
        const isMenuOpen = hasSubItems && openMenus.has(item.href);

        if (hasSubItems) {
          const filteredSubItems = item.subItems!.filter(subItem => 
            !subItem.roles || subItem.roles.includes(userRole)
          );

          if (filteredSubItems.length === 0) {
            return null; // Don't render the parent if no sub-items are visible
          }
          
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActive && !isMenuOpen} 
                tooltip={{ children: item.label, className: "bg-primary text-primary-foreground" }}
                className="justify-between"
                onClick={() => toggleMenu(item.href)}
                aria-expanded={isMenuOpen}
              >
                <div className="flex items-center gap-2">
                  <item.icon />
                  <span>{item.label}</span>
                </div>
                <ChevronDown className={cn("transition-transform duration-200", isMenuOpen && "rotate-180")} />
              </SidebarMenuButton>

              {isMenuOpen && (
                <SidebarMenuSub>
                  {filteredSubItems.map((subItem) => {
                    const isSubActive = pathname.startsWith(subItem.href);
                    return (
                      <SidebarMenuSubItem key={subItem.href}>
                        <Link href={subItem.href} passHref legacyBehavior>
                          <SidebarMenuSubButton isActive={isSubActive}>
                            {subItem.icon && <subItem.icon className="mr-2 h-4 w-4 shrink-0" />}
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
        }

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
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

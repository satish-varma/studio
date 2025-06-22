
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
  ChevronDown,
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
    href: "/foodstall", 
    label: "Food Stall Management", 
    icon: UtensilsCrossed, 
    roles: ['staff', 'manager', 'admin'],
    subItems: [
      { href: "/foodstall/dashboard", label: "Dashboard" },
      { href: "/foodstall/sales", label: "Sales History" },
      { href: "/foodstall/sales/record", label: "Record Sale" },
      { href: "/foodstall/expenses", label: "Expenses List" },
      { href: "/foodstall/expenses/record", label: "Record Expense" },
      { href: "/foodstall/reports", label: "Financial Reports" },
      { href: "/foodstall/activity-log", label: "Activity Log" },
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
  
  // State to track which menus are open. Key is the item.href
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());

  // Automatically open the parent menu if the current path is inside it.
  useEffect(() => {
    const activeParent = navItems.find(item => item.subItems && pathname.startsWith(item.href));
    if (activeParent) {
      setOpenMenus(prev => {
        if (prev.has(activeParent.href)) return prev; // Avoid unnecessary re-renders
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
          // This button only toggles, it doesn't navigate.
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActive} // The section is active if path is inside it
                tooltip={{ children: item.label, className: "bg-primary text-primary-foreground" }}
                className="justify-between" // To push chevron to the end
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
                  {item.subItems!.map((subItem) => {
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
        }

        // Render regular non-collapsible menu items
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

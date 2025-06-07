
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, UserCircle, Settings, LifeBuoy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

const LOG_PREFIX_USER_NAV = "[UserNav]";

export function UserNav() {
  const { user, signOutUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignOut = async () => {
    console.log(`${LOG_PREFIX_USER_NAV} handleSignOut called.`);
    try {
      await signOutUser();
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
      router.push("/login");
      console.log(`${LOG_PREFIX_USER_NAV} Sign out successful, navigated to login.`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX_USER_NAV} Sign out error:`, error.code, error.message);
      toast({
        title: "Sign Out Error",
        description: `Could not sign out. Error: ${error.message || "Please try again."}`,
        variant: "destructive",
      });
    }
  };

  if (!user) {
    console.log(`${LOG_PREFIX_USER_NAV} No user found, returning null.`);
    return null;
  }

  const getInitials = (name?: string | null) => {
    if (!name || name.trim() === "") return "U";
    const names = name.trim().split(' ').filter(n => n); // Filter out empty strings from multiple spaces
    if (names.length === 0) return "U";
    if (names.length === 1) return names[0][0].toUpperCase();
    return names[0][0].toUpperCase() + names[names.length - 1][0].toUpperCase();
  }
  const userInitials = getInitials(user.displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10 border-2 border-primary">
            <AvatarImage 
              src={user.photoURL || `https://placehold.co/40x40/E3F2FD/4285F4?text=${userInitials}`} 
              alt={user.displayName || "User Avatar"}
              data-ai-hint="user avatar"
            />
            <AvatarFallback className="bg-secondary text-secondary-foreground">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-foreground">
              {user.displayName || "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize pt-1">
              Role: {user.role}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push('/profile')}>
            <UserCircle className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          {(user.role === 'admin' || user.role === 'manager') && (
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/support')}>
          <LifeBuoy className="mr-2 h-4 w-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

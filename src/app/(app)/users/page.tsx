
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users as UsersIcon, Construction } from "lucide-react";

export const metadata = {
  title: "User Management - StallSync",
};

// This page should ideally be protected and only accessible by admins.
// The AppSidebarNav already handles visibility based on role.
// Additional server-side or middleware protection might be needed for direct URL access in a real app.

export default function UserManagementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="View, add, edit, and manage user accounts and their roles."
      />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <UsersIcon className="mr-2 h-5 w-5 text-primary" />
            Manage Users
          </CardTitle>
          <CardDescription>
            This section is for administrators to manage user access and roles within StallSync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-md border border-dashed">
            <Construction className="mx-auto h-12 w-12 text-primary mb-4" />
            <p className="text-xl font-semibold">User Management - Under Construction</p>
            <p className="mt-2 text-sm">
              Full functionality for managing users (listing, editing roles, deleting) will be implemented here soon.
            </p>
            <p className="mt-1 text-xs">
              (Visible to Admins only via sidebar navigation)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

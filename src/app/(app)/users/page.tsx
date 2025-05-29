
import UserManagementClientPage from "@/components/users/UserManagementClientPage";
import PageHeader from "@/components/shared/PageHeader";

export const metadata = {
  title: "User Management - StallSync",
};

export default function UserManagementPage() {
  // Data fetching and management are handled within UserManagementClientPage
  return (
    <div className="space-y-6">
       <PageHeader
        title="User Management"
        description="View, edit roles, and manage user accounts. (Admins Only)"
      />
      <UserManagementClientPage />
    </div>
  );
}

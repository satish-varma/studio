
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";

export const metadata = {
  title: "Settings - StallSync",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Application Settings"
        description="Manage your application preferences and configurations."
      />
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <SettingsIcon className="mr-2 h-5 w-5 text-primary" />
            General Settings
          </CardTitle>
          <CardDescription>
            This is a placeholder for future application settings. 
            Functionality like theme customization, notification preferences, or data export options could be managed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-md">
            <p className="text-lg">Settings Page - Coming Soon!</p>
            <p className="mt-2">More configuration options will be available here in future updates.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Mail, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Support - StallSync",
};

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support & Help Center"
        description="Find answers to your questions or get in touch with our support team."
      />
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <HelpCircle className="mr-2 h-5 w-5 text-primary" />
              Frequently Asked Questions
            </CardTitle>
            <CardDescription>
              Browse through common questions and answers about using StallSync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-6 text-center text-muted-foreground bg-muted/30 rounded-md">
                <p className="text-lg">FAQ - Coming Soon!</p>
                <p className="mt-1 text-sm">A comprehensive list of FAQs will be available here.</p>
            </div>
            {/* Example FAQ item structure - to be populated
            <div>
              <h4 className="font-semibold">How do I add a new item?</h4>
              <p className="text-sm text-muted-foreground">Navigate to 'Stock Items' and click 'Add New Item'.</p>
            </div>
            */}
            <Button variant="outline" className="w-full" disabled>Browse All FAQs (Soon)</Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="mr-2 h-5 w-5 text-primary" />
              Contact Support
            </CardTitle>
            <CardDescription>
              Can't find what you're looking for? Reach out to us directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-6 text-center text-muted-foreground bg-muted/30 rounded-md">
                <p className="text-lg">Contact Options - Coming Soon!</p>
                <p className="mt-1 text-sm">Details for email support or a contact form will appear here.</p>
            </div>
            {/*
            <p className="text-sm">
              For urgent issues, please email us at: <Link href="mailto:support@stallsync.example.com" className="text-primary hover:underline">support@stallsync.example.com</Link>
            </p>
            <p className="text-sm">
              You can also fill out our online support form (link will be here).
            </p>
            */}
            <Button className="w-full" disabled>Contact Us (Soon)</Button>
          </CardContent>
        </Card>
      </div>
       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <LifeBuoy className="mr-2 h-5 w-5 text-primary" />
            Troubleshooting Guides
          </CardTitle>
          <CardDescription>
            Step-by-step guides for resolving common issues.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-md">
                <p className="text-lg">Troubleshooting Guides - Coming Soon!</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}


import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Mail, HelpCircle, BookOpen, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata = {
  title: "Support - StallSync",
};

const faqItems = [
  {
    question: "How do I add a new stock item?",
    answer: "Navigate to 'Stock & Sales' -> 'Stock Items' from the sidebar menu. Click the 'Add New Item' button on the top right. Fill in the item details in the form and click 'Add Item'."
  },
  {
    question: "How can I update the quantity of an existing item?",
    answer: "Go to the 'Stock & Sales' -> 'Stock Items' page. Find the item in the table and click the three-dots menu icon on the right. Select 'Update Stock', enter the new quantity, and save."
  },
  {
    question: "Where can I see my sales history?",
    answer: "Click on 'Stock & Sales' -> 'Sales History' in the sidebar. You can filter sales by date range. Managers and Admins can also filter by staff member."
  },
  {
    question: "How do I change my display name?",
    answer: "Click on your avatar in the top right corner to open the user menu, then select 'Profile'. You can update your display name there."
  }
];

const userGuideItems = [
    {
        question: "Getting Started Guide",
        answer: (
            <div className="space-y-2 text-muted-foreground">
                <p>Welcome to StallSync! Your first steps depend on your role.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Admins:</strong> Your primary role is to set up the application structure.
                        <ul className="list-circle pl-5 mt-1">
                            <li><strong>1. Setup Sites & Stalls:</strong> Go to 'Administration' &rarr; 'Manage Sites & Stalls'. Create your business locations (Sites) first, then add the specific points of sale or storage (Stalls) within each site.</li>
                            <li><strong>2. Create Users:</strong> Go to 'Administration' &rarr; 'User Management'. Create accounts for your managers and staff, assigning them the correct roles and site/stall contexts.</li>
                            <li><strong>3. Add Master Stock:</strong> Navigate to 'Stock & Sales' &rarr; 'Stock Items'. Select a site from the header to view its "Master Stock". Use the "Add New Item" button to populate your main inventory.</li>
                            <li><strong>4. Allocate Stock:</strong> From the Master Stock view, use the action menu on an item to 'Allocate to Stall', moving inventory to where it can be sold.</li>
                        </ul>
                    </li>
                    <li><strong>Managers:</strong> Once an Admin assigns you to a site, you can select it from the header. Your view is now contextual to that site.
                         <ul className="list-circle pl-5 mt-1">
                            <li>Review the 'Dashboard' for an overview of your site's performance.</li>
                            <li>Use the 'Stock & Sales' section to manage inventory, transfer items between stalls, and view sales reports for your site.</li>
                             <li>Use the 'Staff' section to manage attendance and payroll for staff members at your site.</li>
                        </ul>
                    </li>
                    <li><strong>Staff:</strong> Your view is automatically set to your assigned site and stall.
                        <ul className="list-circle pl-5 mt-1">
                           <li>Go to 'Stock & Sales' &rarr; 'Record Sale' to process customer transactions.</li>
                           <li>If assigned to a food stall, use the 'Food Stall' section to record daily sales summaries and expenses.</li>
                           <li>Update your personal information in 'My Profile'.</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    },
    {
        question: "Stock & Sales Module",
        answer: (
             <div className="space-y-2 text-muted-foreground">
                <p>This module is the core of your inventory and sales management.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Stock Items:</strong> This page shows all inventory. Use the filters to narrow down your view. "Master Stock" is the main inventory for a site. "Stall Stock" is inventory available at a specific point of sale, allocated from the master stock.</li>
                    <li><strong>Item Actions:</strong> The three-dots menu on each item row allows for powerful actions:
                        <ul className="list-circle pl-5 mt-1">
                           <li><strong>Update Stock:</strong> For direct quantity changes (e.g., correcting a miscount). This affects master stock if the stall item is linked.</li>
                           <li><strong>Allocate to Stall:</strong> (Master stock only) Moves a specified quantity to a stall, making it available for sale there.</li>
                           <li><strong>Return to Master:</strong> (Stall stock only) Moves quantity from a stall back to the main site inventory.</li>
                           <li><strong>Transfer to Stall:</strong> (Stall stock only) Moves quantity from one stall directly to another within the same site.</li>
                        </ul>
                    </li>
                    <li><strong>Record Sale:</strong> You can only sell items that are in stock at the currently selected stall. Completing a sale automatically decrements the stock quantity.</li>
                    <li><strong>Sales History:</strong> Review all past transactions. Admins and Managers have advanced filtering options. Click any transaction ID to view a detailed, printable receipt.</li>
                     <li><strong>Sales Reports:</strong> Analyze key metrics like COGS, profit, and see top-selling items. Use the AI summary for a quick analysis of trends.</li>
                </ul>
            </div>
        )
    },
     {
        question: "Food Stall Module",
        answer: (
             <div className="space-y-2 text-muted-foreground">
                <p>This is a dedicated module for tracking food-related finances separately from general stock.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Dashboard:</strong> Get a quick overview of sales, expenses, and net profit for the food stall in your selected context.</li>
                    <li><strong>Add Expense:</strong> Use this to record purchases like groceries, vegetables, and supplies. You can manage a list of common vendors in 'Settings'.</li>
                    <li><strong>Add Sales:</strong> Instead of individual items, you record the total daily sales summary. This is broken down by mealtime (e.g., Breakfast, Lunch) and payment type (e.g., UPI, Cash, HungerBox).</li>
                    <li><strong>Reports:</strong> The Food Stall has its own financial reports to track profitability based on its unique sales and expense structure.</li>
                    <li><strong>Activity Log:</strong> A specific log to track every expense and sales summary entry related to food stalls.</li>
                </ul>
            </div>
        )
    },
    {
        question: "Staff Management Module",
        answer: (
             <div className="space-y-2 text-muted-foreground">
                <p>This module (for Managers & Admins) handles staff attendance and payroll.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Staff List:</strong> View all staff and managers. Admins can edit profiles from here.</li>
                    <li><strong>Attendance:</strong> A monthly calendar view to mark attendance. Click on a cell to cycle through Present, Absent, Leave, and Half-day. Weekends and holidays are marked automatically. Admins can manage the holiday list in 'Settings'.</li>
                    <li><strong>Salary Advances:</strong> Record any cash advances given to staff during the month. These are automatically deducted during payroll calculation.</li>
                    <li><strong>Payroll:</strong> At the end of the month, this page automatically calculates each employee's net salary based on their base salary, days worked (from attendance), and any advances taken. You can then record salary payments.</li>
                    <li><strong>Activity Log:</strong> Tracks all staff-related actions, such as attendance changes, payments, and profile updates, providing a clear audit trail.</li>
                </ul>
            </div>
        )
    },
    {
        question: "User Roles Explained",
        answer: (
             <div className="space-y-2 text-muted-foreground">
                <p>StallSync has three user roles with different permissions:</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                  <li><strong>Admin:</strong> Has full control over the entire application. They can create sites, stalls, and users, manage all financial data, and view logs across all locations.</li>
                  <li><strong>Manager:</strong> Can manage all aspects of the sites they are assigned to, including stock, sales, and staff. They cannot create new sites, users, or access site data they are not assigned to.</li>
                  <li><strong>Staff:</strong> Has the most focused role. They can record sales and manage stock quantities for their specifically assigned site and stall. They can view their own profile but cannot access broader reports or other users' data.</li>
                </ul>
            </div>
        )
    },
];

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
          <CardContent>
            {faqItems.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {faqItems.map((faq, index) => (
                  <AccordionItem value={`item-${index}`} key={index}>
                    <AccordionTrigger className="text-sm font-medium hover:no-underline text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="p-6 text-center text-muted-foreground bg-muted/30 rounded-md">
                <p className="text-lg">No FAQs available yet.</p>
              </div>
            )}
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
            <p className="text-sm">
              For urgent issues or specific queries, please email us at: 
              <Link href="mailto:support@stallsync.example.com" className="text-primary hover:underline font-medium ml-1">
                support@stallsync.example.com
              </Link>
            </p>
            <p className="text-sm">
              We aim to respond to all queries within 24-48 business hours.
            </p>
            <Button className="w-full" asChild>
              <Link href="mailto:support@stallsync.example.com">
                 <Mail className="mr-2 h-4 w-4" /> Email Support
              </Link>
            </Button>
             <div className="p-4 mt-4 text-center text-muted-foreground bg-muted/30 rounded-md border border-dashed">
                <MessageSquare className="mx-auto h-8 w-8 text-primary mb-2" />
                <p className="text-md font-semibold">Live Chat / Ticketing System</p>
                <p className="mt-1 text-xs"> (Coming Soon for premium users)</p>
            </div>
          </CardContent>
        </Card>
      </div>
       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BookOpen className="mr-2 h-5 w-5 text-primary" />
            User Guides &amp; Documentation
          </CardTitle>
          <CardDescription>
            In-depth guides and tutorials for using StallSync features.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Accordion type="single" collapsible className="w-full">
            {userGuideItems.map((item, index) => (
                <AccordionItem value={`guide-${index}`} key={`guide-${index}`}>
                    <AccordionTrigger className="text-base font-semibold hover:no-underline text-left">{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

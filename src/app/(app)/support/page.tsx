
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
            <div className="space-y-4 text-muted-foreground">
                <p>Welcome to StallSync! Your first steps depend on your role. This guide will walk you through the initial setup and core tasks to get you operational.</p>
                
                <div className="p-3 border rounded-md bg-muted/30">
                    <h4 className="font-semibold text-foreground mb-2">For Administrators: The Setup Architect</h4>
                    <p className="mb-2">Your primary role is to build the foundational structure of the application. Follow these steps in order:</p>
                    <ul className="list-decimal pl-6 mt-2 space-y-2">
                        <li><strong>Setup Sites & Stalls:</strong> Go to <span className="font-semibold text-primary/90">'Administration' &rarr; 'Manage Sites & Stalls'</span>. A 'Site' is a physical location (e.g., "Main Warehouse", "Downtown Branch"). A 'Stall' is a specific point of sale or storage within a Site (e.g., "Front Counter", "Storage Room A"). You must create a Site before you can add Stalls to it.</li>
                        <li><strong>Create Users:</strong> Go to <span className="font-semibold text-primary/90">'Administration' &rarr; 'User Management'</span> and click "Add New Member". Create accounts for your managers and staff.
                            <ul className="list-disc pl-5 mt-1 text-xs">
                                <li>When creating a <span className="font-semibold">Manager</span>, you must assign them to one or more sites they will oversee.</li>
                                <li>When creating <span className="font-semibold">Staff</span>, you must assign them a default Site and can optionally assign a default Stall. This determines where their sales are recorded.</li>
                            </ul>
                        </li>
                        <li><strong>Add Master Stock:</strong> Navigate to <span className="font-semibold text-primary/90">'Stock & Sales' &rarr; 'Stock Items'</span>. Use the header dropdowns to select a Site. This view, without a specific stall selected, is the "Master Stock" for that site. Use the "Add New Item" button to populate your main inventory.</li>
                        <li><strong>Allocate Stock:</strong> From the Master Stock view, use the action menu (three dots) on an item to select 'Allocate to Stall'. This moves inventory from the site's general holding to a specific stall, making it available for sale there.</li>
                    </ul>
                </div>

                <div className="p-3 border rounded-md bg-muted/30">
                    <h4 className="font-semibold text-foreground mb-2">For Managers: The Site Operator</h4>
                    <p className="mb-2">Once an Admin assigns you to a site(s), you can select it from the dropdown in the header. Your entire view is now contextual to that site.</p>
                     <ul className="list-decimal pl-6 mt-2 space-y-2">
                        <li><strong>Review the Dashboard:</strong> Get a quick overview of your site's performance, including sales totals and low stock alerts across all stalls in your site.</li>
                        <li><strong>Manage Inventory:</strong> In the <span className="font-semibold text-primary/90">'Stock & Sales'</span> section, you can perform advanced stock movements like transferring items between two stalls within your site or returning stall stock back to the site's master inventory.</li>
                        <li><strong>Oversee Staff:</strong> Use the <span className="font-semibold text-primary/90">'Staff'</span> section to manage attendance records, review and process monthly payroll, and issue salary advances for staff members assigned to your site.</li>
                    </ul>
                </div>
                 <div className="p-3 border rounded-md bg-muted/30">
                    <h4 className="font-semibold text-foreground mb-2">For Staff: The Frontline Operator</h4>
                    <p className="mb-2">Your view is automatically set to your assigned site and stall. Your focus is on day-to-day operations.</p>
                     <ul className="list-decimal pl-6 mt-2 space-y-2">
                       <li><strong>Record Sales:</strong> Your main task is in <span className="font-semibold text-primary/90">'Stock & Sales' &rarr; 'Record Sale'</span>. The form is pre-set to your assigned stall, and you can only sell items that have been allocated to your stall.</li>
                       <li><strong>Handle Food Stall Duties:</strong> If assigned to a food stall, use the <span className="font-semibold text-primary/90">'Food Stall'</span> section to record daily sales summaries and any expenses you incur (like buying groceries).</li>
                       <li><strong>Update Your Profile:</strong> Keep your personal information up-to-date in 'My Profile'.</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        question: "The Dashboard Explained",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>The dashboard is your mission control, providing a real-time snapshot of your current context (the site and/or stall you have selected in the header).</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Statistic Cards:</strong> At the top, you'll find key performance indicators (KPIs) like Total Items in context, Total Sales for the last 7 days, Items Sold Today, and the number of items that have hit their low stock threshold.</li>
                    <li><strong>Sales Chart (Managers/Admins):</strong> A bar chart visualizing the total sales amount for each of the last 7 days. This helps you quickly identify recent trends.</li>
                    <li><strong>Recent Sales:</strong> A list of the last few transactions. You can click on any sale to view its detailed receipt.</li>
                    <li><strong>Items Low on Stock:</strong> An actionable list of items that are at or below their defined "Low Stock Threshold". This helps you prioritize reordering or re-stocking from master inventory.</li>
                    <li><strong>Quick Actions:</strong> Buttons to immediately navigate to the "Record Sale" or "Add New Item" pages. The "Record Sale" button is only enabled when a specific stall is selected as the active context.</li>
                </ul>
            </div>
        )
    },
    {
        question: "Stock & Sales Module In-Depth",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>This module is the core of your inventory and sales management. Understanding the distinction between Master and Stall stock is key.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Master vs. Stall Stock:</strong>
                        <ul className="list-disc pl-5 mt-1 text-xs">
                            <li><strong>Master Stock:</strong> The main inventory for a Site. Think of it as the 'main warehouse' or 'back room'. It's not directly for sale. You view this by selecting a Site but having "All Stalls" selected in the header.</li>
                            <li><strong>Stall Stock:</strong> Inventory that has been moved from Master Stock to a specific Stall. This is the stock that is available for sale on the "Record Sale" page.</li>
                        </ul>
                    </li>
                    <li><strong>Item Actions (The three-dots menu):</strong> This menu provides powerful inventory management actions.
                        <ul className="list-disc pl-5 mt-1 text-xs">
                           <li><strong>Update Stock:</strong> For direct quantity changes (e.g., correcting a miscount, noting spoilage). If you update a stall item's quantity, the linked master stock is automatically adjusted to reflect this change (e.g., if you reduce stall quantity by 1 for spoilage, the master quantity is also reduced by 1).</li>
                           <li><strong>Allocate to Stall:</strong> (Master stock only) Moves a specified quantity from the master item to a stall, creating a linked stall item if one doesn't exist, or adding to its quantity if it does.</li>
                           <li><strong>Return to Master:</strong> (Stall stock only) The reverse of allocation. Moves quantity from a stall item back to its linked master item.</li>
                           <li><strong>Transfer to Stall:</strong> (Stall stock only) Moves quantity from one stall directly to another within the same site, without involving the master stock.</li>
                           <li><strong>Batch Actions:</strong> For stall items, you can select multiple items using the checkboxes and then use the "Batch Actions" dropdown to edit details, set quantity, or delete them all at once.</li>
                        </ul>
                    </li>
                    <li><strong>Record Sale:</strong> You can only sell items that are in stock at the currently selected stall. Completing a sale automatically decrements the stock quantity from both the stall item and its linked master item.</li>
                    <li><strong>Sales Reports:</strong> Analyze key metrics like Cost of Goods Sold (COGS), Gross Profit, and Profit Margin. This page also shows your top-selling items by quantity and revenue, and includes an AI-generated summary of trends for quick insights.</li>
                </ul>
            </div>
        )
    },
     {
        question: "Food Stall Module In-Depth",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>This is a dedicated module for tracking food-related finances separately from general stock, designed for simpler, summary-based tracking.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Dashboard:</strong> Get a quick overview of sales, expenses, and net profit for the food stall in your selected context. Use the date filters to see performance over different periods.</li>
                    <li><strong>Add Expense:</strong> A specialized form to record purchases like groceries, vegetables, and supplies. You can manage a central list of common vendors in 'Settings' to speed up entry. It's crucial for tracking your daily costs accurately.</li>
                    <li><strong>Add Sales:</strong> This page is for managing a single sales summary document per day. Instead of individual items, you record the total revenue for different meal times (e.g., Breakfast, Lunch, Dinner, Snacks) and break it down by the payment method used (e.g., UPI, Cash, HungerBox). This simplifies daily cash-out and reconciliation.</li>
                    <li><strong>Reports:</strong> The Food Stall has its own financial reports to track profitability. It calculates your net profit by subtracting total expenses and a fixed 20% commission on HungerBox sales from your total gross sales.</li>
                    <li><strong>Activity Log:</strong> A specific, un-editable log that chronologically tracks every expense and sales summary entry related to food stalls, providing a clear audit trail.</li>
                </ul>
            </div>
        )
    },
    {
        question: "Staff Management Module In-Depth",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>This module (for Managers & Admins) handles all aspects of staff administration, from attendance to payroll.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>Dashboard:</strong> See key metrics at a glance, including total active staff, their projected total monthly salary, and today's attendance status.</li>
                    <li><strong>Staff List:</strong> View all staff and managers. Admins can edit profiles from here, which includes setting their phone number, address, base salary, and joining/exit dates.</li>
                    <li><strong>Attendance:</strong> A monthly calendar register. Click on a cell to cycle through attendance statuses (Present, Absent, Leave, Half-day, or clear). Weekends and holidays (which Admins can manage in 'Settings') are marked automatically and are not clickable.</li>
                    <li><strong>Salary Advances:</strong> Record any cash advances given to staff during the month. These are automatically deducted during the final payroll calculation.</li>
                    <li><strong>Payroll:</strong> At the end of the month, this page automatically calculates each employee's net payable salary based on: (Base Salary / Working Days in Month) * (Days Present + 0.5 * Half-days) - Advances. You can then record full or partial salary payments against this amount.</li>
                    <li><strong>Activity Log:</strong> Tracks all staff-related actions, such as attendance changes, payments, and profile updates, providing a clear audit trail for administrative actions.</li>
                </ul>
            </div>
        )
    },
     {
        question: "Administration Module In-Depth",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>This module is visible only to Admins and provides top-level control over the application's structure and user base.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>User Management:</strong> This is where you create, view, and manage all user accounts. You can change a user's role (e.g., promote a Staff member to a Manager), assign them to sites/stalls, and activate or deactivate their accounts. Deactivating an account prevents the user from logging in.</li>
                    <li><strong>Manage Sites & Stalls:</strong> This is the architectural backbone of your setup.
                        <ul className="list-disc pl-5 mt-1 text-xs">
                            <li><strong>Sites:</strong> Create your main business locations here.</li>
                            <li><strong>Stalls:</strong> After creating a site, you can add multiple stalls within it. This two-level hierarchy is essential for organizing inventory and sales data correctly.</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    },
    {
        question: "Profile & Settings Explained",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>These pages allow for personalization and high-level data management.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                    <li><strong>My Profile (`/profile`):</strong> Every user can update their own display name here. Additionally, users can set their default filter preferences for the 'Stock Items' and 'Sales History' pages, saving time by automatically applying their most-used filters upon visiting those pages.</li>
                    <li><strong>Settings (`/settings`):</strong>
                         <ul className="list-disc pl-5 mt-1 text-xs">
                            <li><strong>Data Management:</strong> Admins and Managers can export their current view of stock or sales data to a CSV file for external analysis. Admins can also import data for stock items and food expenses from a CSV, which is useful for initial setup or bulk updates.</li>
                             <li><strong>Food Stall Settings:</strong> Manage a central list of vendors used in the Food Stall expense tracking to ensure consistent naming.</li>
                             <li><strong>Danger Zone (Admins Only):</strong> This section provides tools to reset application data. This is an irreversible action and should be used with extreme caution, typically only for testing or starting fresh.</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    },
    {
        question: "User Roles Explained",
        answer: (
             <div className="space-y-4 text-muted-foreground">
                <p>StallSync has three user roles with a clear hierarchy of permissions, ensuring that users only see and do what's relevant to their job.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                  <li><strong>Admin:</strong> The superuser. Has full, unrestricted control over the entire application. They are the only ones who can create other users, set up sites and stalls, and access system-wide activity logs. They see data from all sites and can switch their context freely.</li>
                  <li><strong>Manager:</strong> The site supervisor. A manager is assigned to one or more specific sites by an Admin. They can perform all operational tasks within their assigned sites, including managing stock, transferring inventory between stalls, viewing reports, and managing staff attendance and payroll. They cannot create new sites, users, or access data from sites they do not manage.</li>
                  <li><strong>Staff:</strong> The frontline operator. A staff member is assigned to a single default site and usually a single default stall. Their role is the most focused: they record sales and manage stock quantities for their specific, pre-assigned context. They can view their own sales history but cannot access broader reports or other users' data.</li>
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

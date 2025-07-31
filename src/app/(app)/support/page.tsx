
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Mail, HelpCircle, BookOpen, MessageSquare, Wrench } from "lucide-react"; // Added Wrench
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata = {
  title: "Support - StallSync",
};

const faqItems = [
  {
    question: "How do I add a new stock item?",
    answer: "Navigate to 'Stock & Sales' from the sidebar menu. Click the 'Add New Item' button on the top right. Fill in the item details in the form and click 'Add Item'."
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
                    <AccordionTrigger className="text-sm font-medium hover:no-underline">
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
            <AccordionItem value="item-1">
              <AccordionTrigger>Getting Started</AccordionTrigger>
              <AccordionContent>
                Welcome to StallSync! Your first steps depend on your role.
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Admins:</strong> Start by setting up your business structure in 'Administration' -&gt; 'Manage Sites &amp; Stalls'. Then, create user accounts for your team in 'User Management'.</li>
                  <li><strong>Managers:</strong> Once an Admin assigns you to a site, you can select it from the header. From there, you can manage stock, view sales, and oversee staff for that location.</li>
                  <li><strong>Staff:</strong> Your view is automatically set to your assigned site and stall. You can start recording sales or managing stock quantities right away.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Managing Stock</AccordionTrigger>
              <AccordionContent>
                All stock operations are handled in the 'Stock & Sales' -&gt; 'Stock Items' page.
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Master Stock:</strong> This is the inventory held at the site level. Use the 'Allocate to Stall' action to move items from here to a specific stall.</li>
                  <li><strong>Stall Stock:</strong> This is the inventory within a specific stall. You can record sales from this stock. Use 'Return to Master' to send items back, or 'Transfer to Stall' to move them between stalls at the same site.</li>
                  <li><strong>Updating Quantity:</strong> Use the 'Update Stock' action for direct quantity adjustments. This automatically adjusts master stock if the item is linked.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Processing Sales</AccordionTrigger>
              <AccordionContent>
                To record a transaction, go to 'Stock & Sales' -&gt; 'Record Sale'. Your current stall context must be selected. You can only sell items available in that specific stall's inventory. Stock levels are automatically updated when a sale is completed.
              </AccordionContent>
            </AccordionItem>
             <AccordionItem value="item-4">
              <AccordionTrigger>User Roles Explained</AccordionTrigger>
              <AccordionContent>
                StallSync has three user roles with different permissions:
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Admin:</strong> Has full control over the entire application, including creating sites, stalls, and users.</li>
                  <li><strong>Manager:</strong> Can manage all aspects of the sites they are assigned to, including stock, sales, and staff. They cannot create new sites or users.</li>
                  <li><strong>Staff:</strong> Has the most focused role, primarily recording sales and managing stock quantities for their specifically assigned site and stall.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
             <AccordionItem value="item-5">
              <AccordionTrigger>Food Stall Module</AccordionTrigger>
              <AccordionContent>
                The 'Food Stall' section is a dedicated module for tracking food-related finances separately from general stock.
                <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
                  <li><strong>Add Expense:</strong> Use this to record purchases like groceries, vegetables, and supplies.</li>
                  <li><strong>Add Sales:</strong> Instead of individual items, you record the total daily sales summary, broken down by mealtime (e.g., Breakfast, Lunch) and payment type (e.g., UPI, Cash).</li>
                  <li><strong>Reports:</strong> The Food Stall has its own financial reports to track profitability based on its unique sales and expense structure.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

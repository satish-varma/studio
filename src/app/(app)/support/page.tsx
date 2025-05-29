
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
    answer: "Navigate to 'Stock Items' from the sidebar menu. Click the 'Add New Item' button on the top right. Fill in the item details in the form and click 'Add Item'."
  },
  {
    question: "How can I update the quantity of an existing item?",
    answer: "Go to the 'Stock Items' page. Find the item in the table and click the three-dots menu icon on the right. Select 'Update Stock', enter the new quantity, and save."
  },
  {
    question: "Where can I see my sales history?",
    answer: "Click on 'Sales History' in the sidebar. You can filter sales by date range. Managers and Admins can also filter by staff member."
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
            User Guides & Documentation
          </CardTitle>
          <CardDescription>
            In-depth guides and tutorials for using StallSync features.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-md border border-dashed">
                <Wrench className="mx-auto h-12 w-12 text-primary mb-4" /> {/* Replaced Construction with Wrench */}
                <p className="text-xl font-semibold">Comprehensive Guides - Coming Soon!</p>
                <p className="mt-2 text-sm">
                  We are working on detailed documentation and video tutorials.
                </p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

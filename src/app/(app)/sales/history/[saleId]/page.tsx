
"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { SaleTransaction, SoldItem } from '@/types';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image'; // For logo in print view
import { useReactToPrint } from 'react-to-print';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SaleDetailsPage:", error);
  }
}
const db = getFirestore();

export default function SaleDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const saleId = params.saleId as string;

  const [transaction, setTransaction] = useState<SaleTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const printableComponentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printableComponentRef.current,
    documentTitle: `Receipt-Sale-${saleId.substring(0,8)}`,
    onBeforeGetContent: () => {
      toast({ title: "Preparing receipt...", description: "Please wait a moment." });
      return Promise.resolve();
    },
    onAfterPrint: () => toast({ title: "Print job sent."}),
    removeAfterPrint: true, // Clean up the iframe
  });


  useEffect(() => {
    if (saleId) {
      const fetchTransaction = async () => {
        setLoading(true);
        setError(null);
        try {
          const saleDocRef = doc(db, "salesTransactions", saleId);
          const saleDocSnap = await getDoc(saleDocRef);

          if (saleDocSnap.exists()) {
            const data = saleDocSnap.data();
            setTransaction({ 
              id: saleDocSnap.id,
              ...data,
              transactionDate: (data.transactionDate as any).toDate().toISOString(), // Convert Firestore Timestamp
            } as SaleTransaction);
          } else {
            setError("Sale transaction not found.");
            toast({ title: "Error", description: "Sale transaction not found.", variant: "destructive" });
            router.replace("/sales/history");
          }
        } catch (err: any) {
          console.error("Error fetching sale transaction:", err);
          setError("Failed to load sale transaction data.");
          toast({ title: "Error", description: "Failed to load sale data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchTransaction();
    } else {
      setLoading(false);
      setError("No sale ID provided.");
      router.replace("/sales/history");
    }
  }, [saleId, router, toast]);
  
  useEffect(() => {
    if (transaction?.id) {
      document.title = `Sale Details ${transaction.id.substring(0,8)} - StallSync`;
    }
     return () => { document.title = "StallSync - Stock Management"; }
  }, [transaction?.id]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString('en-IN', { // Changed to en-IN for Indian locale
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      });
    } catch (e) { return "Invalid Date"; }
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sale details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sale Details" />
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
           <Button onClick={() => router.push("/sales/history")} className="mt-4">
            Back to Sales History
          </Button>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p>Sale transaction data could not be loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sale Details: #${transaction.id.substring(0, 8)}...`}
        description={`Recorded on ${formatDate(transaction.transactionDate)} by ${transaction.staffName || 'N/A'}.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print Receipt
            </Button>
          </div>
        }
      />

      <Card ref={printableComponentRef} className="shadow-lg printable-area"> {/* Ref for printing */}
        <CardHeader className="border-b print:border-b-2 print:border-black">
           <div className="flex justify-between items-center">
            <div>
                <CardTitle className="text-2xl print:text-3xl">Receipt / Sale Invoice</CardTitle>
                <CardDescription className="print:text-sm">Transaction ID: {transaction.id}</CardDescription>
            </div>
            <div className="print:block hidden"> {/* Show logo only on print */}
                 <Image 
                    src="https://placehold.co/100x40.png?text=StallSync" 
                    alt="StallSync Logo"
                    data-ai-hint="logo simple"
                    width={100}
                    height={40}
                    className="rounded-md"
                />
            </div>
           </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-4 print:grid-cols-2">
            <div>
              <h3 className="font-semibold text-lg mb-1 print:text-xl">Transaction Details:</h3>
              <p className="text-sm text-muted-foreground print:text-base"><strong>Date:</strong> {formatDate(transaction.transactionDate)}</p>
              <p className="text-sm text-muted-foreground print:text-base"><strong>Staff:</strong> {transaction.staffName || transaction.staffId.substring(0,8)}</p>
            </div>
             <div className="print:block hidden text-right"> {/* Company details for print */}
                <p className="font-semibold">Your Company Name</p>
                <p className="text-xs">123 Market Street, Cityville</p>
                <p className="text-xs">contact@example.com</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2 print:text-xl">Items Sold:</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="print:border-b print:border-black">
                    <TableHead className="print:text-base">Item Name</TableHead>
                    <TableHead className="text-right print:text-base">Quantity</TableHead>
                    <TableHead className="text-right print:text-base">Price/Unit</TableHead>
                    <TableHead className="text-right print:text-base">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transaction.items.map((item, index) => (
                    <TableRow key={index} className="print:border-b print:border-gray-300">
                      <TableCell className="font-medium print:text-sm">{item.name}</TableCell>
                      <TableCell className="text-right print:text-sm">{item.quantity}</TableCell>
                      <TableCell className="text-right print:text-sm">₹{item.pricePerUnit.toFixed(2)}</TableCell> {/* Updated currency symbol */}
                      <TableCell className="text-right print:text-sm">₹{item.totalPrice.toFixed(2)}</TableCell> {/* Updated currency symbol */}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t print:border-t-2 print:border-black">
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground print:text-xl">
                Grand Total: ₹{transaction.totalAmount.toFixed(2)} {/* Updated currency symbol */}
              </p>
            </div>
          </div>
           <div className="print:block hidden pt-6 text-center text-xs"> {/* Footer for print */}
                <p>Thank you for your purchase!</p>
            </div>
        </CardContent>
      </Card>

      {/* Hidden div for printing styles - not strictly necessary with Tailwind's print modifiers but can be useful */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact; /* Ensures background colors and images are printed */
            print-color-adjust: exact;
          }
          .printable-area { /* Styles for the specific area to be printed */
            margin: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            font-family: 'Arial', sans-serif;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

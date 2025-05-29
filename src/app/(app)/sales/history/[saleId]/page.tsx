
"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import { getFirestore, doc, getDoc, DocumentSnapshot } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { SaleTransaction, SoldItem, Site, Stall } from '@/types';
import { Loader2, Printer, ArrowLeft, Store, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
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
  const [siteDetails, setSiteDetails] = useState<Site | null>(null);
  const [stallDetails, setStallDetails] = useState<Stall | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const printableComponentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => printableComponentRef.current,
    documentTitle: `Receipt-Sale-${saleId?.substring(0,8) || 'details'}`,
    onBeforeGetContent: () => {
      toast({ title: "Preparing receipt...", description: "Please wait a moment." });
      return Promise.resolve();
    },
    onAfterPrint: () => toast({ title: "Print job sent."}),
    removeAfterPrint: true, 
  });


  useEffect(() => {
    if (saleId) {
      const fetchTransactionDetails = async () => {
        setLoading(true);
        setError(null);
        try {
          const saleDocRef = doc(db, "salesTransactions", saleId);
          const saleDocSnap = await getDoc(saleDocRef);

          if (saleDocSnap.exists()) {
            const data = saleDocSnap.data() as Omit<SaleTransaction, 'id'>;
            const currentTransaction: SaleTransaction = { 
              id: saleDocSnap.id,
              ...data,
              transactionDate: (data.transactionDate as any).toDate().toISOString(),
            };
            setTransaction(currentTransaction);

            // Fetch site details if siteId exists
            if (currentTransaction.siteId) {
              const siteDocRef = doc(db, "sites", currentTransaction.siteId);
              const siteDocSnap = await getDoc(siteDocRef);
              if (siteDocSnap.exists()) {
                setSiteDetails({ id: siteDocSnap.id, ...siteDocSnap.data() } as Site);
              } else {
                console.warn(`Site details not found for siteId: ${currentTransaction.siteId}`);
              }
            }

            // Fetch stall details if stallId exists
            if (currentTransaction.stallId) {
              const stallDocRef = doc(db, "stalls", currentTransaction.stallId);
              const stallDocSnap = await getDoc(stallDocRef);
              if (stallDocSnap.exists()) {
                setStallDetails({ id: stallDocSnap.id, ...stallDocSnap.data() } as Stall);
              } else {
                console.warn(`Stall details not found for stallId: ${currentTransaction.stallId}`);
              }
            }

          } else {
            setError("Sale transaction not found.");
            toast({ title: "Error", description: "Sale transaction not found.", variant: "destructive" });
            router.replace("/sales/history");
          }
        } catch (err: any) {
          console.error("Error fetching sale transaction details:", err);
          setError("Failed to load sale transaction data.");
          toast({ title: "Error", description: "Failed to load sale data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchTransactionDetails();
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
      return new Date(dateString).toLocaleString('en-IN', {
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
        description={
          <div className="text-sm text-muted-foreground">
            <p>Recorded on {formatDate(transaction.transactionDate)} by {transaction.staffName || 'N/A'}.</p>
            {siteDetails && <p className="flex items-center"><Building className="h-4 w-4 mr-1" />Site: {siteDetails.name}</p>}
            {stallDetails && <p className="flex items-center"><Store className="h-4 w-4 mr-1" />Stall: {stallDetails.name} ({stallDetails.stallType})</p>}
          </div>
        }
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

      <Card ref={printableComponentRef} className="shadow-lg printable-area">
        <CardHeader className="border-b print:border-b-2 print:border-black">
           <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-2xl print:text-3xl">Receipt / Sale Invoice</CardTitle>
                <CardDescription className="print:text-sm">Transaction ID: {transaction.id}</CardDescription>
                 {siteDetails && <p className="text-xs text-muted-foreground print:text-sm flex items-center mt-1"><Building className="h-3 w-3 mr-1" />{siteDetails.name} {siteDetails.location && `(${siteDetails.location})`}</p>}
                 {stallDetails && <p className="text-xs text-muted-foreground print:text-sm flex items-center"><Store className="h-3 w-3 mr-1" />{stallDetails.name} ({stallDetails.stallType})</p>}
            </div>
            <div className="print:block hidden">
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
             <div className="print:block hidden text-right">
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
                      <TableCell className="text-right print:text-sm">
                        ₹{typeof item.pricePerUnit === 'number' ? item.pricePerUnit.toFixed(2) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right print:text-sm">
                        ₹{typeof item.totalPrice === 'number' ? item.totalPrice.toFixed(2) : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t print:border-t-2 print:border-black">
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground print:text-xl">
                Grand Total: ₹{transaction.totalAmount.toFixed(2)}
              </p>
            </div>
          </div>
           <div className="print:block hidden pt-6 text-center text-xs">
                <p>Thank you for your purchase!</p>
            </div>
        </CardContent>
      </Card>

      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
          }
          .printable-area { 
            margin: 0;
            padding: 10px;
            border: none;
            font-family: 'Arial', sans-serif;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
          /* Additional print specific styles can go here */
          .page-header, .sidebar, .header-content, .action-buttons {
            display: none !important; /* Hide non-receipt elements */
          }
        }
      `}</style>
    </div>
  );
}


"use client";

import { useState } from 'react';
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Eye, EyeOff } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebaseConfig';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';

const LOG_PREFIX = "[ScrapingPage]";

interface ScrapedData {
  siteName: string;
  stallName: string;
  totalSales: number;
}

export default function ScrapingPage() {
  const [username, setUsername] = useState("the_gut_guru");
  const [password, setPassword] = useState("hungerbox@123");
  const [isScraping, setIsScraping] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [scrapedData, setScrapedData] = useState<ScrapedData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  const handleScrape = async () => {
    if (!username || !password) {
      toast({ title: "Missing Credentials", description: "Please enter your Hungerbox username and password.", variant: "destructive" });
      return;
    }
    if (!user || !auth || !auth.currentUser) {
      toast({ title: "Authentication Error", description: "You must be logged in to perform this action.", variant: "destructive" });
      return;
    }

    setIsScraping(true);
    setError(null);
    setScrapedData(null);
    toast({ title: "Scraping Started...", description: "Connecting to Hungerbox and fetching reports. This may take some time.", duration: 15000 });

    try {
      const idToken = await auth.currentUser.getIdToken(true);

      const response = await fetch('/api/scrape-hungerbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      setScrapedData(result.data);
      toast({ title: "Scraping Successful", description: result.message, variant: "default", duration: 7000 });
      
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error during scraping process:`, error);
      setError(error.message);
      toast({ title: "Scraping Failed", description: error.message, variant: "destructive", duration: 10000 });
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hungerbox Web Scraper"
        description="Automate the process of fetching sales data from the Hungerbox dashboard."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Hungerbox Credentials</CardTitle>
            <CardDescription>
              Enter your login details to initiate the scraping process. These credentials are sent securely to the server and are not stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <Alert variant="default" className="border-primary/30">
              <Bot className="h-4 w-4" />
              <AlertTitle>Developer Note</AlertTitle>
              <AlertDescription className="text-xs">
                This feature uses a headless browser (Puppeteer) on the server. The current implementation uses mock data for demonstration.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="hb-username">Username</Label>
              <Input
                id="hb-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.email@example.com"
                disabled={isScraping}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hb-password">Password</Label>
              <div className="relative">
                <Input
                  id="hb-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isScraping}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleScrape} disabled={isScraping || !username || !password} className="w-full">
              {isScraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
              Start Scraping & Fetch Report
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Scraping Results</CardTitle>
            <CardDescription>
              The aggregated sales data from the downloaded report will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isScraping && (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Fetching and processing data...</p>
                </div>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>An Error Occurred</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {scrapedData && (
                 <ScrollArea className="h-96">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Site Name</TableHead>
                                <TableHead>Stall Name</TableHead>
                                <TableHead className="text-right">Total Sales</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {scrapedData.map((data, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-medium">{data.siteName}</TableCell>
                                    <TableCell>{data.stallName}</TableCell>
                                    <TableCell className="text-right font-mono">₹{data.totalSales.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                 </ScrollArea>
            )}
             {!isScraping && !error && !scrapedData && (
                <div className="text-center py-20">
                    <p className="text-muted-foreground">Results will be displayed here once scraping is complete.</p>
                </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

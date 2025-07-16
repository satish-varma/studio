
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StaffDetailsForm from "@/components/staff/StaffDetailsForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { AppUser, StaffDetails } from '@/types';
import { Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const LOG_PREFIX = "[EditStaffPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function EditStaffPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const staffUid = params.uid as string;

  const [staffUser, setStaffUser] = useState<AppUser | null>(null);
  const [staffDetails, setStaffDetails] = useState<StaffDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staffUid) {
      const fetchStaffData = async () => {
        setLoading(true);
        setError(null);
        try {
          // Fetch AppUser data
          const userDocRef = doc(db, "users", staffUid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setStaffUser({ uid: userDocSnap.id, ...userDocSnap.data() } as AppUser);
          } else {
            throw new Error("Staff member's main account not found.");
          }

          // Fetch StaffDetails data (from a separate collection)
          const detailsDocRef = doc(db, "staffDetails", staffUid);
          const detailsDocSnap = await getDoc(detailsDocRef);
          if (detailsDocSnap.exists()) {
            setStaffDetails({ uid: detailsDocSnap.id, ...detailsDocSnap.data() } as StaffDetails);
          } else {
            setStaffDetails(null); // It's okay if details don't exist yet
          }
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Error fetching staff data for UID ${staffUid}:`, err);
          setError(err.message || "Failed to load staff data.");
          toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchStaffData();
    } else {
      setError("No staff member ID provided.");
      setLoading(false);
    }
  }, [staffUid, toast]);
  
  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading staff details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Staff Profile" />
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={() => router.back()} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </div>
    );
  }
  
  if (!staffUser) {
      return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Profile: ${staffUser.displayName}`}
        description={`Update personal and employment details for this staff member.`}
      />
      <StaffDetailsForm
        staffUid={staffUid}
        initialData={staffDetails}
        staffUser={staffUser}
      />
    </div>
  );
}

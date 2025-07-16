
import type { Timestamp } from "firebase/firestore";
import * as z from "zod";

// --------------- Staff Details ---------------
export interface StaffDetails {
  uid: string; // Corresponds to AppUser UID
  phoneNumber?: string;
  address?: string;
  joiningDate?: string; // ISO date string
  salary?: number;
  exitDate?: string | null; // ISO date string
  // Other details like emergency contact, ID numbers can be added here
}

export const staffDetailsFormSchema = z.object({
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    joiningDate: z.date().optional().nullable(),
    salary: z.coerce.number().min(0).optional(),
    exitDate: z.date().optional().nullable(),
});

export type StaffDetailsFormValues = z.infer<typeof staffDetailsFormSchema>;


// --------------- Staff Attendance ---------------
export const attendanceStatuses = ["Present", "Absent", "Half-day", "Leave"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export interface StaffAttendance {
  id: string; // Composite ID like YYYY-MM-DD_staffUid
  staffUid: string;
  date: string; // YYYY-MM-DD format
  status: AttendanceStatus;
  notes?: string;
  siteId: string;
  recordedByUid: string;
  recordedByName: string;
}

export interface StaffAttendanceAdmin extends Omit<StaffAttendance, 'date'> {
    date: Timestamp;
}


// --------------- Salary Advance ---------------
export interface SalaryAdvance {
  id: string; // Firestore document ID
  staffUid: string;
  amount: number;
  date: string; // ISO date string
  notes?: string;
  recordedByUid: string;
  recordedByName: string;
  siteId: string;
}

export const salaryAdvanceFormSchema = z.object({
  amount: z.coerce.number().positive("Advance amount must be a positive number."),
  date: z.date({ required_error: "Date of advance is required."}),
  notes: z.string().optional(),
});

export type SalaryAdvanceFormValues = z.infer<typeof salaryAdvanceFormSchema>;


// --------------- Salary Payment ---------------
export interface SalaryPayment {
    id: string;
    staffUid: string;
    amountPaid: number;
    paymentDate: string; // ISO date string
    forMonth: number; // 1-12
    forYear: number;
    notes?: string;
    recordedByUid: string;
    recordedByName: string;
    siteId: string;
}

export const salaryPaymentFormSchema = z.object({
    amountPaid: z.coerce.number().positive("Paid amount must be a positive number."),
    paymentDate: z.date({ required_error: "Payment date is required." }),
    notes: z.string().optional(),
});

export type SalaryPaymentFormValues = z.infer<typeof salaryPaymentFormSchema>;

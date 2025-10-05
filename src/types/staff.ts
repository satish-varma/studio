
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
    // Added site and stall for assignment updates on the same form
    defaultSiteId: z.string().optional().nullable(),
    defaultStallId: z.string().optional().nullable(),
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
  date: string; // ISO date string of when the advance was given
  notes?: string;
  recordedByUid: string;
  recordedByName: string;
  siteId: string; // The site where the advance was recorded
  staffSiteId: string; // The site the staff member belongs to
  forMonth: number; // 1-12
  forYear: number;
}

export const salaryAdvanceFormSchema = z.object({
  amount: z.coerce.number().positive("Advance amount must be a positive number."),
  date: z.date({ required_error: "Date of advance is required."}),
  forDate: z.string().min(1, { message: "The month this advance applies to is required."}),
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


// --------------- Salary History (Appraisal) ---------------
export interface SalaryHistory {
    id: string; // Firestore document ID
    staffUid: string;
    newSalary: number;
    effectiveDate: string; // YYYY-MM-DD format
    notes?: string;
    recordedByUid: string;
    recordedByName: string;
    recordedAt: string; // ISO timestamp
}

export const salaryHistoryFormSchema = z.object({
    newSalary: z.coerce.number().min(0, "Salary must be a non-negative number."),
    effectiveDate: z.date({ required_error: "Effective date is required." }),
    notes: z.string().optional(),
});

export type SalaryHistoryFormValues = z.infer<typeof salaryHistoryFormSchema>;



export const staffActivityTypes = [
  'ATTENDANCE_MARKED',
  'SALARY_ADVANCE_GIVEN',
  'STAFF_DETAILS_UPDATED',
  'SALARY_PAID',
  'USER_STATUS_CHANGED'
] as const;

export type StaffActivityType = (typeof staffActivityTypes)[number];

export interface StaffActivityLog {
  id?: string; // Firestore document ID
  siteId: string | null; // Site ID related to the event
  userId: string; // UID of the admin/manager performing the action
  userName?: string;
  timestamp: string; // ISO string
  type: StaffActivityType;
  relatedStaffUid: string; // UID of the staff member the log pertains to
  details: {
    // Attendance details
    date?: string; // YYYY-MM-DD
    status?: string | null;
    // Salary advance/payment details
    amount?: number;
    relatedDocumentId?: string; // ID of the advance or payment document
    // Common details
    notes?: string | null;
  };
}

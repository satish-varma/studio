
export type StaffActivityType =
  | 'ATTENDANCE_MARKED'
  | 'SALARY_ADVANCE_GIVEN'
  | 'STAFF_DETAILS_UPDATED';

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
    // Salary advance details
    amount?: number;
    relatedDocumentId?: string; // ID of the advance document
    // Common details
    notes?: string | null;
  };
}

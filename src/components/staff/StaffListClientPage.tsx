
"use client";

import { useState, useMemo, useEffect } from "react";
import type { AppUser, Site, Stall, UserStatus, StaffDetails } from "@/types";
import { StaffListTable } from "@/components/staff/StaffListTable";

// This component is now purely for rendering the table and its state logic.
// The PageHeader and filters have been moved up to the page.tsx level.

interface StaffListClientPageProps {
  staffUsers: AppUser[];
  sitesMap: Record<string, string>;
  staffDetails: Map<string, StaffDetails>;
  selectedUserIds: string[];
  setSelectedUserIds: (ids: string[]) => void;
}

export default function StaffListClientPage({
  staffUsers,
  sitesMap,
  staffDetails,
  selectedUserIds,
  setSelectedUserIds,
}: StaffListClientPageProps) {

  return (
    <StaffListTable
      users={staffUsers}
      sitesMap={sitesMap}
      staffDetailsMap={staffDetails}
      selectedUserIds={selectedUserIds}
      onSelectionChange={setSelectedUserIds}
    />
  );
}

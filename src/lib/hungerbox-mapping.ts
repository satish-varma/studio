
// This file contains the mapping from Hungerbox's internal vendor IDs
// to the Site and Stall names used within the StallSync application.

// This allows for accurate data import from detailed Hungerbox sales reports.
// The key is the 'consumption vendor id' from the Hungerbox CSV.

interface HungerboxMapping {
  [vendorId: string]: {
    site: string;
    stall: string;
  };
}

export const hungerboxVendorMapping: HungerboxMapping = {
  "22911": { site: "ORION IBM", stall: "14th Floor Tuck Shop" },
  "22861": { site: "ORION IBM", stall: "B5 Tuck Shop" },
  "22912": { site: "UPPAL IBM", stall: "TuckShop" },
  "22909": { site: "ORION IBM", stall: "B6 Live Counter" },
  "22906": { site: "ORION IBM", stall: "10th Floor Tuck Shop" },
  "22905": { site: "ORION IBM", stall: "B5 Live Counter" },
  "22908": { site: "ORION IBM", stall: "11th Floor Tuck Shop" },
  "22915": { site: "MindSpace IBM", stall: "Live Counter" },
};

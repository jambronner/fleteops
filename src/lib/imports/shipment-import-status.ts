type ShipmentTrackerImportStatusInput = {
  created: number;
  skipped: number;
  unmatchedLocations: number;
  duplicateSkipped: number;
};

export function resolveShipmentTrackerImportBatchStatus(result: ShipmentTrackerImportStatusInput) {
  if (result.skipped > 0 || result.unmatchedLocations > 0 || result.duplicateSkipped > 0) {
    return "partially_completed";
  }

  return "completed";
}

import type { HistogramResult } from "~/types";

/**
 * Hardcoded JSON with many object types per event.
 * Each histogram has ~30 bins (x = 1..30) to test horizontal scroll.
 */
export const HISTOGRAM_DEMO: HistogramResult = {
  histograms: [
    // ----- Event: Deliver -----
    ...["Container", "Item", "Truck", "Pallet", "Warehouse", "Driver", "Route", "Invoice", "Dock", "Crane"]
      .map((otype) => ({
        event_type: "Deliver",
        object_type: otype,
        histogram: Array.from({ length: 30 }, (_, i) => ({
          count: i + 1,
          frequency: Math.floor(Math.random() * 30) + 1,
        })),
      })),

    // ----- Event: Order -----
    ...["Customer", "Item", "Shipment", "Payment", "Invoice", "Supplier", "Warehouse", "Route", "PO", "Cart"]
      .map((otype) => ({
        event_type: "Order",
        object_type: otype,
        histogram: Array.from({ length: 30 }, (_, i) => ({
          count: i + 1,
          frequency: Math.floor(Math.random() * 30) + 1,
        })),
      })),

    // ----- Event: Return -----
    ...["Customer", "Item", "Container", "Refund", "SupportTicket", "Driver", "Warehouse", "Invoice", "RMA", "Inspection"]
      .map((otype) => ({
        event_type: "Return",
        object_type: otype,
        histogram: Array.from({ length: 30 }, (_, i) => ({
          count: i + 1,
          frequency: Math.floor(Math.random() * 30) + 1,
        })),
      })),
  ],
};
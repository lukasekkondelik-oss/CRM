/** Dodání vyhraného dealu: po výhře se pracuje dál (realizace nebo běžící předplatné), dokud se neodklikne „dodáno“. */
export type DeliveryStatus = "in_progress" | "ongoing" | "done";

export const DELIVERY_STATUSES: DeliveryStatus[] = ["in_progress", "ongoing", "done"];
export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  in_progress: "Pracuje se na tom",
  ongoing: "Běží (předplatné)",
  done: "Dodáno",
};
export const DELIVERY_SHORT: Record<DeliveryStatus, string> = {
  in_progress: "V realizaci",
  ongoing: "Předplatné",
  done: "Dodáno",
};

interface DealLike { status: string; delivery_status?: string | null }

/** Vyhraný deal, který ještě není dodaný (realizace nebo běžící předplatné). */
export const isDelivering = (d: DealLike) => d.status === "won" && (d.delivery_status === "in_progress" || d.delivery_status === "ongoing");

/** Deal, u kterého se plánují aktivity: otevřený nebo ve fázi dodání. */
export const isActiveDeal = (d: DealLike) => d.status === "open" || isDelivering(d);

/** Deal, který by měl mít vždy naplánovaný další krok (předplatné ho mít nemusí). */
export const needsNextStep = (d: DealLike) => d.status === "open" || (d.status === "won" && d.delivery_status === "in_progress");

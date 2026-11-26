export type StockStatus = 'available' | 'out-of-stock';

/** A VPS plan, reduced from the (huge) OVH public catalog. */
export interface CatalogPlan {
  planCode: string;
  name: string;
  /** e.g. "VPS 2 vCPU 4 GB RAM 40 GB disk" */
  description: string;
  vcpu: number | null;
  ramGb: number | null;
  diskGb: number | null;
  /** Monthly price, no commitment, excluding VAT. */
  price: number;
  datacenters: string[];
}

export interface Catalog {
  subsidiary: string;
  currency: string;
  /** VAT rate in percent, e.g. 20. */
  taxRate: number;
  updatedAt: string;
  plans: CatalogPlan[];
}

export interface DatacenterAvailability {
  datacenter: string;
  linux: StockStatus;
  windows: StockStatus;
}

/** One plan in one datacenter, as seen during a check. */
export interface Offer {
  plan: CatalogPlan;
  datacenter: string;
  linux: StockStatus;
  windows: StockStatus;
}

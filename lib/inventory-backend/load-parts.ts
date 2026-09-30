import { fetchAllRows, fetchAllRowsParallel } from "@/lib/supabase/fetch-all";
import { createInventoryServiceClient } from "./server";
import type {
  InventoryLocation,
  InventoryPart,
  InventorySpecification,
} from "./types";

/** Columns the tile grid and client-side search actually read. */
const LIST_COLUMNS =
  "part_id,skaps_number,product_name,product_description,location_on_machine,line_number,main_category,subcategory,current_quantity,inventory_location_count,warehouses,qr_code,active_rfid_tag_count,has_image,active";

const LOCATION_COLUMNS =
  "inventory_record_id,part_id,quantity,zone,location_code,storage_location,warehouse_description,location_on_machine,line_number";

type ListRow = {
  part_id: number | null;
  skaps_number: string | null;
  product_name: string | null;
  product_description: string | null;
  location_on_machine: string | null;
  line_number: string | null;
  main_category: string | null;
  subcategory: string | null;
  current_quantity: number | string | null;
  inventory_location_count: number | null;
  warehouses: string | null;
  qr_code: string | null;
  active_rfid_tag_count: number | null;
  has_image: boolean | null;
  active: boolean | null;
};

type DetailRow = ListRow & {
  primary_image_bucket: string | null;
  primary_image_path: string | null;
  active_image_count: number | null;
  has_rfid: boolean | null;
  specification_count: number | null;
  specifications: unknown;
  has_specifications: boolean | null;
  updated_at: string | null;
};

type LocationRow = {
  inventory_record_id: number | null;
  part_id: number | null;
  quantity: number | string | null;
  zone: string | null;
  location_code: string | null;
  storage_location: string | null;
  warehouse_description: string | null;
  location_on_machine: string | null;
  line_number: string | null;
};

function numberValue(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseSpecifications(value: unknown): InventorySpecification[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : null;
    const name = typeof row.name === "string" ? row.name : null;
    if (!key || !name) return [];

    return [
      {
        key,
        name,
        display_value:
          typeof row.display_value === "string" ? row.display_value : null,
        value_numeric:
          typeof row.value_numeric === "number" ? row.value_numeric : null,
        value_text: typeof row.value_text === "string" ? row.value_text : null,
        unit: typeof row.unit === "string" ? row.unit : null,
      },
    ];
  });
}

function specificationDisplay(
  specs: InventorySpecification[],
  key: string,
): string | null {
  const match = specs.find((spec) => spec.key.toLowerCase() === key.toLowerCase());
  return match?.display_value ?? match?.value_text ?? null;
}

function toLocation(row: LocationRow, sortOrder: number): InventoryLocation | null {
  if (!row.part_id || !row.inventory_record_id) return null;
  return {
    id: String(row.inventory_record_id),
    inventory_record_id: row.inventory_record_id,
    part_id: String(row.part_id),
    quantity: numberValue(row.quantity),
    lwhsdesc: row.warehouse_description,
    zone: row.zone,
    location: row.location_code,
    storage_location: row.storage_location,
    location_on_machine: row.location_on_machine,
    line_no: row.line_number,
    source_sheet: null,
    external_row_id: null,
    sort_order: sortOrder,
    created_at: "",
    updated_at: "",
  };
}

function adaptPart(
  row: ListRow,
  extras: {
    variants: InventoryLocation[];
    specifications: InventorySpecification[];
    imageUrl: string | null;
    imageBucket: string | null;
    imagePath: string | null;
    activeImageCount: number;
    hasImage: boolean;
    hasRfid: boolean;
    hasSpecifications: boolean;
    updatedAt: string | null;
  },
): InventoryPart | null {
  if (!row.part_id || !row.skaps_number) return null;
  const qty = numberValue(row.current_quantity);
  const primary = extras.variants[0];
  const locationCount = row.inventory_location_count ?? extras.variants.length;

  return {
    id: String(row.part_id),
    part_id: row.part_id,
    skaps_number: row.skaps_number,
    name: row.product_name?.trim() || row.skaps_number,
    description: row.product_description,
    category: row.main_category,
    sub_category: row.subcategory,
    location: primary?.location ?? null,
    location_on_machine: row.location_on_machine ?? primary?.location_on_machine ?? null,
    line_no: row.line_number ?? primary?.line_no ?? null,
    zone: primary?.zone ?? null,
    storage_location: primary?.storage_location ?? null,
    lwhsdesc: primary?.lwhsdesc ?? null,
    size: specificationDisplay(extras.specifications, "size"),
    belt_type: specificationDisplay(extras.specifications, "belt_type"),
    vendor_names: specificationDisplay(extras.specifications, "vendor"),
    unit: "each",
    current_quantity: qty,
    quantity_on_hand: qty,
    reorder_threshold: null,
    notes: null,
    used_last_30d: null,
    image_url: extras.imageUrl,
    updated_at: extras.updatedAt,
    created_at: null,
    variant_count: locationCount,
    variants: extras.variants.slice(),
    qr_code: row.qr_code,
    active_rfid_tag_count: row.active_rfid_tag_count ?? 0,
    inventory_location_count: locationCount,
    primary_image_bucket: extras.imageBucket,
    primary_image_path: extras.imagePath,
    active_image_count: extras.activeImageCount,
    has_image: row.has_image ?? extras.hasImage,
    has_rfid: extras.hasRfid,
    specification_count: extras.specifications.length,
    specifications: extras.specifications.slice(),
    has_specifications: extras.hasSpecifications,
    warehouses: row.warehouses,
    active: row.active ?? true,
  };
}

const emptyDetail = {
  variants: [] as InventoryLocation[],
  specifications: [] as InventorySpecification[],
  imageUrl: null,
  imageBucket: null,
  imagePath: null,
  activeImageCount: 0,
  hasImage: false,
  hasRfid: false,
  hasSpecifications: false,
  updatedAt: null,
};

function listQuery(client: ReturnType<typeof createInventoryServiceClient>) {
  return client
    .from("parts_app_view")
    .select(LIST_COLUMNS)
    .eq("active", true)
    .order("skaps_number", { ascending: true })
    .order("part_id", { ascending: true });
}

/** Loads the catalog fields needed for tiles and search. Locations, specs, and images load on open. */
export async function loadInventoryParts(): Promise<InventoryPart[]> {
  const client = createInventoryServiceClient();

  const { count, error: countError } = await client
    .from("parts_app_view")
    .select("part_id", { count: "exact", head: true })
    .eq("active", true);

  const fetched =
    countError || count == null
      ? await fetchAllRows<ListRow>((from, to) => listQuery(client).range(from, to))
      : await fetchAllRowsParallel<ListRow>(
          (from, to) => listQuery(client).range(from, to),
          count,
        );

  if (countError) console.error("failed to count SKAPS inventory", countError);
  if (fetched.error) console.error("failed to load new SKAPS inventory", fetched.error);

  return fetched.data.flatMap((row) => {
    const part = adaptPart(row, emptyDetail);
    return part ? [part] : [];
  });
}

/** Loads locations, specifications, and one signed image for a single part. */
export async function loadInventoryPartDetail(partId: number): Promise<InventoryPart | null> {
  const client = createInventoryServiceClient();

  const [{ data: row, error: partError }, locationsResult] = await Promise.all([
    client
      .from("parts_app_view")
      .select("*")
      .eq("part_id", partId)
      .eq("active", true)
      .maybeSingle(),
    fetchAllRows<LocationRow>((from, to) =>
      client
        .from("current_inventory_detail")
        .select(LOCATION_COLUMNS)
        .eq("part_id", partId)
        .order("inventory_record_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (partError) console.error("failed to load SKAPS part detail", partError);
  if (locationsResult.error) console.error("failed to load SKAPS locations", locationsResult.error);
  if (!row) return null;

  const detail = row as DetailRow;
  const variants = locationsResult.data.flatMap((location, index) => {
    const adapted = toLocation(location, index);
    return adapted ? [adapted] : [];
  });
  const specifications = parseSpecifications(detail.specifications);

  let imageUrl: string | null = null;
  if (detail.primary_image_bucket && detail.primary_image_path) {
    const signed = await client.storage
      .from(detail.primary_image_bucket)
      .createSignedUrl(detail.primary_image_path, 60 * 60);
    if (!signed.error && signed.data?.signedUrl) imageUrl = signed.data.signedUrl;
  }

  return adaptPart(detail, {
    variants,
    specifications,
    imageUrl,
    imageBucket: detail.primary_image_bucket,
    imagePath: detail.primary_image_path,
    activeImageCount: detail.active_image_count ?? 0,
    hasImage: detail.has_image ?? Boolean(imageUrl),
    hasRfid: detail.has_rfid ?? (detail.active_rfid_tag_count ?? 0) > 0,
    hasSpecifications: detail.has_specifications ?? specifications.length > 0,
    updatedAt: detail.updated_at,
  });
}

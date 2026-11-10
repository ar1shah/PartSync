import { unstable_cache } from "next/cache";
import { normalizeSkapsNumber } from "@/lib/forms/normalize";
import { logPayloadSize, timed } from "@/lib/perf";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createInventoryServiceClient } from "./server";
import type {
  InventoryListPart,
  InventoryLocation,
  InventoryPart,
  InventorySpecification,
} from "./types";

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

/** Cache tag for the full list. Revalidated wherever parts_list_mv is refreshed. */
export const INVENTORY_PARTS_TAG = "inventory-parts";

/**
 * Shards exist because Vercel caps a cache entry at 2MB and silently skips
 * anything larger. The whole list is ~1.91MB, so it is split into ~500kB
 * entries under one shared tag. The final shard is unbounded, so the catalog
 * can grow without a code change; OVERSIZE_SHARD_BYTES warns if one ever
 * approaches the cap.
 */
const SHARD_SIZE = 2500;
const SHARD_COUNT = 4;
const OVERSIZE_SHARD_BYTES = 1_500_000;

/**
 * One row from inventory_parts_list(). POSITIONAL — this must stay in step
 * with the tuple layout documented in
 * supabase/inventory-migrations/0003_inventory_parts_rpcs.sql.
 */
type ListTuple = [
  part_id: number,
  skaps_number: string | null,
  product_name: string | null,
  product_description: string | null,
  main_category: string | null,
  subcategory: string | null,
  location_on_machine: string | null,
  line_number: string | null,
  warehouses: string | null,
  current_quantity: number | string | null,
  inventory_location_count: number | null,
  has_image: 1 | null,
];

function decodeListTuple(tuple: ListTuple): InventoryListPart | null {
  const [
    partId,
    skapsNumber,
    productName,
    description,
    category,
    subCategory,
    locationOnMachine,
    lineNumber,
    warehouses,
    quantity,
    locationCount,
    hasImage,
  ] = tuple;

  if (!partId || !skapsNumber) return null;

  return {
    part_id: partId,
    skaps_number: skapsNumber,
    name: productName?.trim() || skapsNumber,
    description,
    category,
    sub_category: subCategory,
    location_on_machine: locationOnMachine,
    line_no: lineNumber,
    warehouses,
    quantity_on_hand: numberValue(quantity),
    variant_count: locationCount ?? 0,
    has_image: hasImage === 1,
    // Filled in client-side by the signed-URL effect, never by the list load.
    image_url: null,
    // Not modelled in the new backend yet; kept so the shared stock-status
    // helpers work against list rows as well as full parts.
    reorder_threshold: null,
  };
}

/** Fetches one shard of the list. `null` limit means "to the end". */
async function fetchListShard(index: number): Promise<ListTuple[]> {
  const isLast = index === SHARD_COUNT - 1;
  const client = createInventoryServiceClient();

  const { data, error } = await client.rpc("inventory_parts_list", {
    p_offset: index * SHARD_SIZE,
    p_limit: isLast ? null : SHARD_SIZE,
  });

  if (error) {
    console.error(`failed to load inventory shard ${index}`, error);
    return [];
  }

  const tuples = (data ?? []) as ListTuple[];

  if (isLast) {
    const bytes = JSON.stringify(tuples).length;
    if (bytes > OVERSIZE_SHARD_BYTES) {
      console.warn(
        `inventory shard ${index} is ${bytes} bytes, approaching the 2MB cache-entry limit — raise SHARD_COUNT in lib/inventory-backend/load-parts.ts`,
      );
    }
  }

  return tuples;
}

/**
 * Cached per shard rather than as one entry, with a shared tag so a single
 * revalidateTag(INVENTORY_PARTS_TAG) drops all of them together. Safe to
 * cache: the inventory service client reads no cookies and holds no
 * request-scoped state, and the auth checks live in the pages, outside this.
 */
const shardLoaders = Array.from({ length: SHARD_COUNT }, (_, index) =>
  unstable_cache(() => fetchListShard(index), ["inventory-parts-shard", String(index)], {
    // Time-based backstop; writes invalidate by tag immediately.
    revalidate: 300,
    tags: [INVENTORY_PARTS_TAG],
  }),
);

/**
 * Loads the catalog fields the tile grid and its client-side search read.
 * Locations, specs and images load on open.
 *
 * One round trip per shard against parts_list_mv (~40ms each) instead of a
 * head count plus ten 1,000-row range queries against the nested
 * parts_app_view (measured 2.2-2.7s), and all four are normally served from
 * the Next.js cache without touching the database at all.
 */
export async function loadInventoryParts(): Promise<InventoryListPart[]> {
  return timed("loadInventoryParts", async () => {
    const shards = await Promise.all(shardLoaders.map((load) => load()));

    const parts = shards.flat().flatMap((tuple) => {
      const part = decodeListTuple(tuple);
      return part ? [part] : [];
    });

    logPayloadSize("loadInventoryParts.tuples", shards);
    logPayloadSize("loadInventoryParts.decoded", parts);
    return parts;
  });
}

type SkapsLookupRow = {
  part_id: number | null;
  skaps_number: string | null;
  product_name: string | null;
  main_category: string | null;
  current_quantity: number | string | null;
};

/** Builds a full ListRow from the handful of columns the SKAPS lookup returns. */
function listRowFromLookup(row: SkapsLookupRow): ListRow {
  return {
    part_id: row.part_id,
    skaps_number: row.skaps_number,
    product_name: row.product_name,
    product_description: null,
    location_on_machine: null,
    line_number: null,
    main_category: row.main_category,
    subcategory: null,
    current_quantity: row.current_quantity,
    inventory_location_count: null,
    warehouses: null,
    qr_code: null,
    active_rfid_tag_count: null,
    has_image: null,
    // parts_list_mv only contains active rows.
    active: true,
  };
}

/**
 * Loads only the parts whose SKAPS number matches one of `skapsNumbers` after
 * normalization — what /admin/used and /admin/requests need to turn free-text
 * `submissions.skaps_number` values into links, instead of loading all ~10k
 * parts to resolve links for at most 500 rows.
 *
 * Matching is unchanged. Normalization uses the same `normalizeSkapsNumber`
 * the client does, and the RPC returns *every* match including
 * normalized-key collisions — so `SubmissionsTable`'s existing
 * drop-on-second-sighting logic still resolves ambiguous keys to no link.
 */
export async function loadInventoryPartsBySkapsNumbers(
  skapsNumbers: Array<string | null | undefined>,
): Promise<InventoryPart[]> {
  const keys = Array.from(
    new Set(
      skapsNumbers.flatMap((value) => {
        const normalized = value ? normalizeSkapsNumber(value) : "";
        return normalized ? [normalized] : [];
      }),
    ),
  );

  if (keys.length === 0) return [];

  return timed(`loadInventoryPartsBySkapsNumbers(${keys.length} keys)`, async () => {
    const client = createInventoryServiceClient();
    const { data, error } = await client.rpc("inventory_parts_by_normalized_skaps", {
      p_keys: keys,
    });

    if (error) {
      console.error("failed to load SKAPS parts by number", error);
      return [];
    }

    const parts = ((data ?? []) as SkapsLookupRow[]).flatMap((row) => {
      const part = adaptPart(listRowFromLookup(row), emptyDetail);
      return part ? [part] : [];
    });

    logPayloadSize("loadInventoryPartsBySkapsNumbers", parts);
    return parts;
  });
}

/** Loads locations, specifications, and one signed image for a single part. */
export async function loadInventoryPartDetail(partId: number): Promise<InventoryPart | null> {
  return timed(`loadInventoryPartDetail(${partId})`, () => loadDetail(partId));
}

async function loadDetail(partId: number): Promise<InventoryPart | null> {
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

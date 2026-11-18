-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Excel saves codes such as 001 or 0838467 as the numbers 1 and 838467, but
-- the inventory was loaded from a copy where they were text. Without this,
-- re-importing that sheet reports hundreds of false "detail changes" and
-- creates duplicate bins (MNT / 1 next to MNT / 001).
--
-- import_same_text(): equal after trimming, or both digit-only and equal
-- once leading zeros are dropped. process_inventory_import() now uses it for
-- every detail comparison and for bin matching (an exact match is preferred
-- when both 1 and 001 exist), and keeps the stored zero-padded value.
-- import_match_key() is the hashable equivalent, used by
-- inventory_import_untouched() so it can hash-join ~11k rows against ~11k bins.

create or replace function public.import_same_text(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when public.import_clean_text(p_a) is not distinct from public.import_clean_text(p_b) then true
    when public.import_clean_text(p_a) ~ '^[0-9]+$' and public.import_clean_text(p_b) ~ '^[0-9]+$'
      then ltrim(btrim(p_a), '0') = ltrim(btrim(p_b), '0')
    else false
  end
$$;

-- Digit-only values become '#' + digits without leading zeros; the prefix
-- keeps '0' from colliding with a blank cell.
create or replace function public.import_match_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.import_clean_text(p_value) ~ '^[0-9]+$'
      then '#' || ltrim(public.import_clean_text(p_value), '0')
    else coalesce(public.import_clean_text(p_value), '')
  end
$$;

create or replace function public.process_inventory_import(
  p_rows jsonb,
  p_apply boolean,
  p_import_batch_id bigint default null,
  p_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_rownum integer;
  v_skaps text;
  v_qty numeric;
  v_zone text;
  v_location text;
  v_storage text;
  v_warehouse text;
  v_name text;
  v_desc text;
  v_lom text;
  v_line text;
  v_main text;
  v_sub text;
  v_part record;
  v_inv record;
  v_created record;
  v_found boolean;
  v_changes jsonb;
  v_action text;
  v_qty_old numeric;
  v_qty_changed boolean;
  v_main_eff text;
  v_sub_eff text;
  v_main_id bigint;
  v_sub_id bigint;
  v_out jsonb := '[]'::jsonb;
  v_seen_parts text[] := '{}';
  v_new_parts text[] := '{}';
  v_source text := coalesce(public.import_clean_text(p_file_name), 'excel-import');
  c_new_parts integer := 0;
  c_new_locations integer := 0;
  c_qty_changes integer := 0;
  c_detail_changes integer := 0;
  c_unchanged integer := 0;
  c_errors integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if p_apply and p_import_batch_id is null then
    raise exception 'p_import_batch_id is required when applying';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_rownum := v_idx;
    if jsonb_typeof(v_row->'row_number') = 'number' then
      v_rownum := (v_row->>'row_number')::integer;
    end if;
    v_skaps := public.import_clean_text(v_row->>'skaps_number');

    begin
      if v_skaps is null then
        raise exception 'Blank SKAPS number';
      end if;

      begin
        v_qty := public.import_clean_text(v_row->>'quantity')::numeric;
      exception when others then
        raise exception 'Quantity is not numeric';
      end;
      if v_qty is null then
        raise exception 'Missing quantity';
      end if;
      if v_qty < 0 then
        raise exception 'Quantity cannot be negative';
      end if;

      v_zone := public.import_clean_text(v_row->>'zone');
      v_location := public.import_clean_text(v_row->>'location_code');
      v_storage := public.import_clean_text(v_row->>'storage_location');
      v_warehouse := public.import_clean_text(v_row->>'warehouse_description');
      v_name := public.import_clean_text(v_row->>'product_name');
      v_desc := public.import_clean_text(v_row->>'product_description');
      v_lom := public.import_clean_text(v_row->>'location_on_machine');
      v_line := public.import_clean_text(v_row->>'line_number');
      v_main := public.import_clean_text(v_row->>'main_category');
      v_sub := public.import_clean_text(v_row->>'subcategory');
      v_changes := '{}'::jsonb;
      v_qty_old := null;

      select
        p.part_id, p.active, p.skaps_prefix,
        p.product_name, p.product_description, p.location_on_machine, p.line_number,
        p.main_category_id, p.subcategory_id,
        mc.category_name as main_category,
        sc.subcategory_name as subcategory
      into v_part
      from public.parts p
      left join public.main_categories mc on mc.main_category_id = p.main_category_id
      left join public.subcategories sc on sc.subcategory_id = p.subcategory_id
      where p.skaps_number = v_skaps;
      v_found := found;

      if v_found and not v_part.active then
        raise exception 'Part exists but is inactive';
      end if;

      if not v_found then
        if v_skaps = any(v_new_parts) then
          v_action := 'new_location';
          c_new_locations := c_new_locations + 1;
        else
          v_action := 'new_part';
          c_new_parts := c_new_parts + 1;
          v_new_parts := v_new_parts || v_skaps;

          if p_apply then
            select * into v_created
            from public.create_skaps_part(
              p_skaps_number := v_skaps,
              p_product_name := coalesce(v_name, v_skaps),
              p_product_description := v_desc,
              p_main_category := v_main,
              p_subcategory := v_sub,
              p_location_on_machine := v_lom,
              p_line_number := v_line,
              p_quantity := v_qty,
              p_zone := v_zone,
              p_location_code := v_location,
              p_storage_location := v_storage,
              p_warehouse_description := v_warehouse,
              p_source_system := 'EXCEL_IMPORT',
              p_source_reference := v_source
            );
            update public.inventory_records
            set import_batch_id = p_import_batch_id,
                source_row_number = v_rownum
            where inventory_record_id = v_created.inventory_record_id;
          end if;
        end if;

        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'row', v_rownum,
          'skaps_number', v_skaps,
          'product_name', coalesce(v_name, v_skaps),
          'action', v_action,
          'qty_old', null,
          'qty_new', v_qty,
          'zone', v_zone,
          'location_code', v_location,
          'warehouse', v_warehouse,
          'storage_location', v_storage,
          'changes', '{}'::jsonb
        ));
        continue;
      end if;

      if not (v_skaps = any(v_seen_parts)) then
        v_seen_parts := v_seen_parts || v_skaps;

        if v_name is not null and not public.import_same_text(v_name, v_part.product_name) then
          v_changes := v_changes || jsonb_build_object('product_name',
            jsonb_build_object('old', v_part.product_name, 'new', v_name));
        end if;
        if v_desc is not null and not public.import_same_text(v_desc, v_part.product_description) then
          v_changes := v_changes || jsonb_build_object('product_description',
            jsonb_build_object('old', v_part.product_description, 'new', v_desc));
        end if;
        if v_lom is not null and not public.import_same_text(v_lom, v_part.location_on_machine) then
          v_changes := v_changes || jsonb_build_object('location_on_machine',
            jsonb_build_object('old', v_part.location_on_machine, 'new', v_lom));
        end if;
        if v_line is not null and not public.import_same_text(v_line, v_part.line_number) then
          v_changes := v_changes || jsonb_build_object('line_number',
            jsonb_build_object('old', v_part.line_number, 'new', v_line));
        end if;
        if v_main is not null and not public.import_same_text(lower(v_main), lower(v_part.main_category)) then
          v_changes := v_changes || jsonb_build_object('main_category',
            jsonb_build_object('old', v_part.main_category, 'new', v_main));
        end if;
        if v_sub is not null and not public.import_same_text(lower(v_sub), lower(v_part.subcategory)) then
          v_changes := v_changes || jsonb_build_object('subcategory',
            jsonb_build_object('old', v_part.subcategory, 'new', v_sub));
        end if;
      end if;

      if p_apply and v_changes <> '{}'::jsonb then
        v_main_id := v_part.main_category_id;
        v_sub_id := v_part.subcategory_id;
        v_main_eff := v_part.main_category;
        v_sub_eff := v_part.subcategory;

        if v_changes ? 'main_category' or v_changes ? 'subcategory' then
          v_main_eff := coalesce(case when v_changes ? 'main_category' then v_main end, v_part.main_category);
          if v_main_eff is null then
            raise exception 'Main category is required when a subcategory is supplied';
          end if;
          insert into public.main_categories (category_name, category_key)
          values (v_main_eff, lower(regexp_replace(v_main_eff, '\s+', ' ', 'g')))
          on conflict (category_key) do update set category_name = public.main_categories.category_name
          returning main_category_id into v_main_id;

          if v_changes ? 'subcategory' then
            v_sub_eff := v_sub;
          end if;
          if v_sub_eff is not null then
            insert into public.subcategories (main_category_id, subcategory_name, subcategory_key)
            values (v_main_id, v_sub_eff, lower(regexp_replace(v_sub_eff, '\s+', ' ', 'g')))
            on conflict (main_category_id, subcategory_key) do update set subcategory_name = public.subcategories.subcategory_name
            returning subcategory_id into v_sub_id;
          end if;
        end if;

        update public.parts
        set product_name = case when v_changes ? 'product_name' then v_name else product_name end,
            product_description = case when v_changes ? 'product_description' then v_desc else product_description end,
            location_on_machine = case when v_changes ? 'location_on_machine' then v_lom else location_on_machine end,
            line_number = case when v_changes ? 'line_number' then v_line else line_number end,
            main_category_id = v_main_id,
            subcategory_id = v_sub_id,
            original_main_category = case when v_changes ? 'main_category' then v_main_eff else original_main_category end,
            original_subcategory = case when v_changes ? 'subcategory' then v_sub_eff else original_subcategory end,
            skaps_family = case
              when v_changes ? 'main_category' or v_changes ? 'subcategory'
                then concat_ws('::', v_main_eff, v_sub_eff, skaps_prefix)
              else skaps_family
            end
        where part_id = v_part.part_id;
      end if;

      select ir.inventory_record_id, ir.quantity, ir.storage_location
      into v_inv
      from public.inventory_records ir
      where ir.part_id = v_part.part_id
        and ir.active = true
        and public.import_same_text(ir.zone, v_zone)
        and public.import_same_text(ir.location_code, v_location)
        and public.import_same_text(ir.warehouse_description, v_warehouse)
      order by
        (public.import_clean_text(ir.zone) is not distinct from v_zone
          and public.import_clean_text(ir.location_code) is not distinct from v_location) desc,
        ir.inventory_record_id
      limit 1;

      if not found then
        v_action := 'new_location';
        c_new_locations := c_new_locations + 1;

        if p_apply then
          insert into public.inventory_records (
            part_id, quantity, zone, location_code, storage_location,
            warehouse_description, import_batch_id, source_row_number,
            row_fingerprint, source_system, source_reference, active
          ) values (
            v_part.part_id, v_qty, v_zone, v_location, v_storage,
            v_warehouse, p_import_batch_id, v_rownum,
            md5(concat_ws('|', 'EXCEL_IMPORT', v_skaps, coalesce(v_zone, ''),
              coalesce(v_location, ''), coalesce(v_warehouse, ''), p_import_batch_id::text)),
            'EXCEL_IMPORT', v_source, true
          );
        end if;
      else
        v_qty_old := coalesce(v_inv.quantity, 0);
        v_qty_changed := v_qty_old <> v_qty;

        if v_storage is not null and not public.import_same_text(v_storage, v_inv.storage_location) then
          v_changes := v_changes || jsonb_build_object('storage_location',
            jsonb_build_object('old', v_inv.storage_location, 'new', v_storage));
        end if;

        if not v_qty_changed and v_changes = '{}'::jsonb then
          c_unchanged := c_unchanged + 1;
          continue;
        end if;

        v_action := 'update';
        if v_qty_changed then
          c_qty_changes := c_qty_changes + 1;
        end if;

        if p_apply and (v_qty_changed or v_changes ? 'storage_location') then
          update public.inventory_records
          set quantity = v_qty,
              storage_location = coalesce(v_storage, storage_location),
              source_system = 'EXCEL_IMPORT',
              source_reference = v_source,
              import_batch_id = p_import_batch_id
          where inventory_record_id = v_inv.inventory_record_id;
        end if;
      end if;

      if v_changes <> '{}'::jsonb then
        c_detail_changes := c_detail_changes + 1;
      end if;

      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'row', v_rownum,
        'skaps_number', v_skaps,
        'product_name', coalesce(v_name, v_part.product_name, v_skaps),
        'action', v_action,
        'qty_old', v_qty_old,
        'qty_new', v_qty,
        'zone', v_zone,
        'location_code', v_location,
        'warehouse', v_warehouse,
        'storage_location', v_storage,
        'changes', v_changes
      ));
    exception when others then
      c_errors := c_errors + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'row', v_rownum,
        'skaps_number', v_skaps,
        'action', 'error',
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'new_parts', c_new_parts,
      'new_locations', c_new_locations,
      'qty_changes', c_qty_changes,
      'detail_changes', c_detail_changes,
      'unchanged', c_unchanged,
      'errors', c_errors
    ),
    'rows', v_out
  );
end;
$$;

create or replace function public.inventory_import_untouched(p_keys jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with k as (
    select
      btrim(e->>0) as skaps,
      public.import_match_key(e->>1) as zone,
      public.import_match_key(e->>2) as loc,
      public.import_match_key(e->>3) as whs
    from jsonb_array_elements(p_keys) e
  ),
  ks as (select distinct skaps from k),
  missing_bins as (
    select p.skaps_number, ir.zone, ir.location_code, ir.warehouse_description, ir.quantity
    from public.inventory_records ir
    join public.parts p on p.part_id = ir.part_id
    where ir.active and p.active
      and exists (select 1 from ks where ks.skaps = p.skaps_number)
      and not exists (
        select 1 from k
        where k.skaps = p.skaps_number
          and k.zone = public.import_match_key(ir.zone)
          and k.loc = public.import_match_key(ir.location_code)
          and k.whs = public.import_match_key(ir.warehouse_description)
      )
  )
  select jsonb_build_object(
    'parts_not_in_sheet', (
      select count(*) from public.parts p
      where p.active and not exists (select 1 from ks where ks.skaps = p.skaps_number)
    ),
    'bins_not_in_sheet', (select count(*) from missing_bins),
    'bins_not_in_sheet_qty', (select coalesce(sum(quantity), 0) from missing_bins),
    'bins_not_in_sheet_sample', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from (select * from missing_bins where quantity > 0 order by skaps_number limit 50) m
    )
  )
$$;

revoke execute on function public.import_same_text(text, text) from public, anon, authenticated;
grant execute on function public.import_same_text(text, text) to service_role;
revoke execute on function public.import_match_key(text) from public, anon, authenticated;
grant execute on function public.import_match_key(text) to service_role;

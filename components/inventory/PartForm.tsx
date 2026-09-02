"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PartFormState } from "@/app/admin/inventory/actions";

interface Props {
  action: (state: PartFormState, formData: FormData) => Promise<PartFormState>;
  submitLabel: string;
  onSuccess?: () => void;
}

export function PartForm({ action, submitLabel, onSuccess }: Props) {
  const [state, formAction] = useActionState(action, {} as PartFormState);

  if (state.ok && onSuccess) queueMicrotask(onSuccess);

  return (
    <form action={formAction} className="space-y-6">
      <Section label="Identification">
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKAPS Number" name="skaps_number" error={state.fieldErrors?.skaps_number} required />
          <Field label="Product Name" name="name" error={state.fieldErrors?.name} required />
          <Field
            label="Product Description"
            name="description"
            error={state.fieldErrors?.description}
            placeholder="Full Datatex-style part description"
            className="col-span-2"
          />
        </div>
      </Section>

      <Section label="Classification">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Main Category" name="category" error={state.fieldErrors?.category} />
          <Field label="Sub-Category" name="sub_category" error={state.fieldErrors?.sub_category} />
        </div>
      </Section>

      <Section label="Inventory location">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location on Machine" name="location_on_machine" error={state.fieldErrors?.location_on_machine} />
          <Field label="Line No." name="line_no" error={state.fieldErrors?.line_no} />
          <Field label="Zone" name="zone" error={state.fieldErrors?.zone} />
          <Field label="Location" name="location" error={state.fieldErrors?.location} />
          <Field
            label="Storage Location"
            name="storage_location"
            error={state.fieldErrors?.storage_location}
            className="col-span-2"
          />
          <Field
            label="Warehouse Description (LWhsDesc)"
            name="lwhsdesc"
            error={state.fieldErrors?.lwhsdesc}
            className="col-span-2"
          />
        </div>
      </Section>

      <Section label="Initial stock">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Quantity is locked at <strong>0</strong> while SKAPS is in trial mode.
        </div>
      </Section>

      <Section label="Optional technical information">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size" name="size" error={state.fieldErrors?.size} placeholder="e.g. 45" />
          <Field label="Size Unit" name="size_unit" error={state.fieldErrors?.size_unit} placeholder="e.g. MM" />
        </div>
      </Section>

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        New parts are created in SKAPS Spare Parts Inventory and receive QR = SKAPS Number automatically.
        Quantity remains 0 during trial mode, and existing imported parts remain Datatex-controlled.
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</h3>
      {children}
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function Field({ label, name, error, className, ...props }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} className="mt-1.5" />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        label
      )}
    </Button>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ProfileForm({
  email,
  firstName,
  lastName,
  displayName,
}: {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}) {
  const [state, formAction] = useActionState(updateProfile, INITIAL);

  useEffect(() => {
    if (state.ok) toast.success("Profile saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input value={email} disabled className="mt-1.5" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            name="first_name"
            defaultValue={firstName}
            required
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input
            id="last_name"
            name="last_name"
            defaultValue={lastName}
            required
            className="mt-1.5"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="display_name">Display name (optional)</Label>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={displayName}
          placeholder="Shown in the dashboard greeting instead of your name"
          className="mt-1.5"
        />
      </div>
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        "Save profile"
      )}
    </Button>
  );
}

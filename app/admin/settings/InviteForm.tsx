"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteStaff, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function InviteForm() {
  const [state, formAction] = useActionState(inviteStaff, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Invite sent");
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div>
        <Label htmlFor="invite_first">First name</Label>
        <Input id="invite_first" name="first_name" required className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="invite_last">Last name</Label>
        <Input id="invite_last" name="last_name" required className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="invite_email">Email</Label>
        <Input
          id="invite_email"
          name="email"
          type="email"
          required
          className="mt-1.5"
        />
      </div>
      <SendButton />
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Sending...
        </>
      ) : (
        "Send invite"
      )}
    </Button>
  );
}

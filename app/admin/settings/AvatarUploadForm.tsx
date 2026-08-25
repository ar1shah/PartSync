"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { uploadAvatar, removeAvatar } from "./actions";

const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUploadForm({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Avatar must be an image");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Avatar must be 2 MB or smaller");
      e.target.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    const formData = new FormData();
    formData.set("avatar", file);
    startTransition(async () => {
      const res = await uploadAvatar(formData);
      if (res.ok) toast.success("Avatar updated");
      else {
        toast.error(res.error ?? "Upload failed");
        setPreview(avatarUrl);
      }
      URL.revokeObjectURL(localPreview);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeAvatar();
      if (res.ok) {
        setPreview(null);
        toast.success("Avatar removed");
      } else {
        toast.error(res.error ?? "Failed to remove avatar");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={preview} size="lg" />
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">PNG or JPG, up to 2 MB.</p>
      </div>
    </div>
  );
}

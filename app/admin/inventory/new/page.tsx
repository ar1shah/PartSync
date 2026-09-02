import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPartClient } from "./NewPartClient";

export default function NewPartPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to inventory
      </Link>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Add a new part</CardTitle>
          <p className="text-sm text-slate-500">
            This creates the part directly in SKAPS Spare Parts Inventory. SKAPS numbers must be
            unique, and the QR identifier is created automatically from the SKAPS number.
          </p>
        </CardHeader>
        <CardContent>
          <NewPartClient />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Package, QrCode, Radio } from "lucide-react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { resolveScan, type ScanState } from "./actions";

type ScannerControls = { stop: () => void };

export function ScanClient() {
  const [state, action, pending] = useActionState(resolveScan, {} as ScanState);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<ScannerControls | null>(null);
  const scanHandledRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraActive) inputRef.current?.focus();
  }, [state, cameraActive]);

  useEffect(() => {
    return () => {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, []);

  async function startCamera() {
    setCameraMessage(null);

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCameraMessage(
        "Camera access requires HTTPS on a phone. Manual entry still works here; use the Vercel Preview URL for camera testing.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("This browser does not provide camera access. Use manual entry instead.");
      return;
    }

    if (!videoRef.current) return;

    stopCamera();
    scanHandledRef.current = false;

    try {
      const reader = new BrowserQRCodeReader();

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        videoRef.current,
        (result, _error, callbackControls) => {
          if (!result || scanHandledRef.current) return;

          const value = result.getText().trim();
          if (!value) return;

          scanHandledRef.current = true;
          inputRef.current && (inputRef.current.value = value);
          typeRef.current && (typeRef.current.value = "QR");
          setCameraMessage(`QR detected: ${value}`);
          callbackControls.stop();
          scannerControlsRef.current = null;
          setCameraActive(false);

          // Submit through the existing authenticated server action so the
          // camera path and manual-entry path have identical authorization,
          // lookup, signed-image, and scan-audit behavior.
          window.setTimeout(() => formRef.current?.requestSubmit(), 0);
        },
      );

      scannerControlsRef.current = controls;
      setCameraActive(true);
      setCameraMessage("Camera ready. Point the rear camera at a Datatex QR label.");
    } catch (error) {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      setCameraActive(false);

      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") {
        setCameraMessage("Camera permission was denied. Allow camera access for this site and try again.");
      } else if (name === "NotFoundError") {
        setCameraMessage("No usable camera was found on this device.");
      } else {
        setCameraMessage(error instanceof Error ? error.message : "Unable to start the camera.");
      }
    }
  }

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setCameraActive(false);

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current!.srcObject = null;
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Phone camera</h2>
                  <p className="mt-1 text-xs text-slate-500">Scan an existing Datatex QR label with the rear camera.</p>
                </div>
                {cameraActive ? (
                  <Button type="button" variant="outline" onClick={stopCamera}>
                    <CameraOff className="h-4 w-4" /> Stop
                  </Button>
                ) : (
                  <Button type="button" onClick={startCamera}>
                    <Camera className="h-4 w-4" /> Scan QR
                  </Button>
                )}
              </div>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
              <video
                ref={videoRef}
                className={`h-full w-full object-cover ${cameraActive ? "block" : "hidden"}`}
                muted
                playsInline
                aria-label="QR scanner camera preview"
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center text-center">
                  <div className="px-5">
                    <QrCode className="mx-auto h-10 w-10 text-slate-500" />
                    <p className="mt-3 text-sm font-medium text-slate-300">Camera is off</p>
                    <p className="mt-1 text-xs text-slate-500">Tap Scan QR to start the rear camera.</p>
                  </div>
                </div>
              )}
              {cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-44 w-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
                </div>
              )}
            </div>

            {cameraMessage && (
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                {cameraMessage}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <form ref={formRef} action={action} className="space-y-4">
              <div>
                <Label htmlFor="identifier_type">Identifier type</Label>
                <select
                  ref={typeRef}
                  id="identifier_type"
                  name="identifier_type"
                  defaultValue=""
                  className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Auto detect</option>
                  <option value="QR">QR</option>
                  <option value="RFID">RFID</option>
                </select>
              </div>
              <div>
                <Label htmlFor="scanned_value">Manual scan value</Label>
                <Input
                  ref={inputRef}
                  id="scanned_value"
                  name="scanned_value"
                  autoComplete="off"
                  placeholder="Scan QR/RFID or type SKAPS number"
                  className="mt-1.5 font-mono"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Datatex QR labels currently encode the SKAPS number. Manual entry remains available if camera access is unavailable.
                </p>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Looking up…" : "Resolve part"}
              </Button>
              {state.error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {state.error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {state.result ? <ScanResult result={state.result} /> : <EmptyResult />}
    </div>
  );
}

function ScanResult({ result }: { result: NonNullable<ScanState["result"]> }) {
  const specs = Array.isArray(result.specifications) ? result.specifications : [];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex gap-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            {result.image_url ? (
              <img src={result.image_url} alt={result.product_name ?? result.skaps_number} className="h-full w-full rounded-lg object-contain" />
            ) : (
              <Package className="h-10 w-10 text-slate-300" />
            )}
          </div>
          <div>
            <p className="font-mono text-xl font-bold text-slate-900">{result.skaps_number}</p>
            <p className="mt-1 text-sm text-slate-700">{result.product_name ?? "Unnamed part"}</p>
            {result.product_description && (
              <p className="mt-1 text-sm text-slate-500">{result.product_description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="accent">{result.matched_identifier_type}</Badge>
              {result.main_category && <Badge tone="neutral">{result.main_category}</Badge>}
              {result.subcategory && <Badge tone="neutral">{result.subcategory}</Badge>}
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Matched value" value={result.matched_identifier_value} mono />
          <Fact label="Current quantity" value={result.current_quantity} />
          <Fact label="Inventory locations" value={result.inventory_location_count} />
          <Fact label="Warehouses" value={result.warehouses} />
          <Fact label="QR" value={result.qr_code} mono icon={<QrCode className="h-3.5 w-3.5" />} />
          <Fact label="Active RFID tags" value={result.active_rfid_tag_count} icon={<Radio className="h-3.5 w-3.5" />} />
        </dl>

        {specs.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Technical specifications</h3>
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(specs, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value, mono, icon }: { label: string; value: string | number | null; mono?: boolean; icon?: React.ReactNode }) {
  if (value === null || value === "") return null;
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs font-medium tracking-wide text-slate-400 uppercase">{icon}{label}</dt>
      <dd className={`mt-1 text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{String(value)}</dd>
    </div>
  );
}

function EmptyResult() {
  return (
    <Card>
      <CardContent className="flex min-h-72 items-center justify-center p-8 text-center">
        <div>
          <QrCode className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Ready for a scan</p>
          <p className="mt-1 text-xs text-slate-500">A matched part will appear here.</p>
        </div>
      </CardContent>
    </Card>
  );
}

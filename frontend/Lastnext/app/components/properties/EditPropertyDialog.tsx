"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";

export function EditPropertyDialog({ property }: {
  property: { property_id: string; name: string; description?: string | null };
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(property.name);
  const [description, setDescription] = useState(property.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (saving) return;
    if (next) {
      setName(property.name);
      setDescription(property.description || "");
      setError("");
    }
    setOpen(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${encodeURIComponent(property.property_id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.detail || result.error || result.name?.[0] || result.description?.[0];
        throw new Error(typeof message === "string" ? message : "Unable to save property. Please try again.");
      }
      setOpen(false);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save property.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Button variant="outline" size="sm" className="m-3 mt-0 self-start" onClick={() => changeOpen(true)} aria-label={`Edit ${property.name}`}>
      <Pencil className="mr-2 h-4 w-4" /> Edit
    </Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit property</DialogTitle>
          <DialogDescription>Update the name and description for {property.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Property name</Label>
            <Input id={`${id}-name`} value={name} onChange={e => setName(e.target.value)} required maxLength={255} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <textarea id={`${id}-description`} value={description} onChange={e => setDescription(e.target.value)} rows={4} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

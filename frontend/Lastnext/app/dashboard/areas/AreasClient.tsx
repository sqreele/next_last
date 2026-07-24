"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  AlertCircle,
  Loader,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { useToast } from "@/app/components/ui/use-toast";
import { useUser } from "@/app/lib/stores/mainStore";
import type { Area, Property } from "@/app/lib/types";

type AreaFormState = {
  id?: number;
  name: string;
  description: string;
  property_id: string;
  is_active: boolean;
};

const emptyForm: AreaFormState = {
  name: "",
  description: "",
  property_id: "",
  is_active: true,
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    if (!data) return err.message || fallback;
    if (typeof data === "string") return data;
    if (data.detail) return String(data.detail);
    const fieldMsgs = Object.entries(data)
      .filter(([k]) => k !== "detail")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    return fieldMsgs.length ? fieldMsgs.join(" | ") : err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const AreasClient: React.FC = () => {
  const { userProfile, selectedPropertyId } = useUser();
  const { toast } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AreaFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null);

  const propertyOptions = useMemo<Property[]>(() => {
    if (properties.length) return properties;
    const profProps = (userProfile?.properties as any[]) || [];
    return profProps as Property[];
  }, [properties, userProfile]);

  // Map the globally selected property_id (string like "P1A2B3C4") to the
  // integer PK that the areas API expects.
  const selectedPropertyPk = useMemo<string | null>(() => {
    if (!selectedPropertyId) return null;
    const match = propertyOptions.find(
      (p: any) =>
        String(p?.property_id ?? "") === String(selectedPropertyId) ||
        String(p?.id ?? "") === String(selectedPropertyId),
    );
    if (!match) return null;
    return (match as any).id != null ? String((match as any).id) : null;
  }, [selectedPropertyId, propertyOptions]);

  const selectedPropertyName = useMemo(() => {
    if (!selectedPropertyId) return null;
    const match = propertyOptions.find(
      (p: any) =>
        String(p?.property_id ?? "") === String(selectedPropertyId) ||
        String(p?.id ?? "") === String(selectedPropertyId),
    );
    return (match as any)?.name || null;
  }, [selectedPropertyId, propertyOptions]);

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (selectedPropertyPk) params.property_id = selectedPropertyPk;
      if (activeFilter !== "all")
        params.is_active = String(activeFilter === "active");
      if (search.trim()) params.search = search.trim();

      const res = await axios.get("/api/areas/", {
        params,
        withCredentials: true,
      });
      const data = res.data;
      const list: Area[] = Array.isArray(data) ? data : data?.results || [];
      setAreas(list);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load areas"));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyPk, activeFilter, search]);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await axios.get("/api/properties/", {
        withCredentials: true,
      });
      const data = res.data;
      const list: Property[] = Array.isArray(data) ? data : data?.results || [];
      setProperties(list);
    } catch {
      // Fall back to user profile properties
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);
  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      property_id:
        selectedPropertyPk ||
        (propertyOptions[0]?.id != null ? String(propertyOptions[0].id) : ""),
    });
    setDialogOpen(true);
  };

  const openEdit = (area: Area) => {
    setForm({
      id: area.id,
      name: area.name,
      description: area.description || "",
      property_id: String(area.property),
      is_active: area.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Validation",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    if (!form.property_id) {
      toast({
        title: "Validation",
        description: "Property is required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        property_id: Number(form.property_id),
      };
      if (form.id) {
        await axios.patch(`/api/areas/${form.id}/`, payload, {
          withCredentials: true,
        });
        toast({ title: "Area updated", variant: "success" });
      } else {
        await axios.post("/api/areas/", payload, { withCredentials: true });
        toast({ title: "Area created", variant: "success" });
      }
      setDialogOpen(false);
      setForm(emptyForm);
      fetchAreas();
    } catch (err) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to save area"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`/api/areas/${deleteTarget.id}/`, {
        withCredentials: true,
      });
      toast({ title: "Area deactivated", variant: "success" });
      setDeleteTarget(null);
      fetchAreas();
    } catch (err) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to delete area"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Areas</h1>
          <p className="text-sm text-muted-foreground">
            Manage property areas / zones used in maintenance jobs.
            {selectedPropertyId ? (
              <span className="ml-1 text-muted-foreground">
                Property:{" "}
                <strong>{selectedPropertyName || selectedPropertyId}</strong>
              </span>
            ) : (
              <span className="ml-1 text-muted-foreground">
                Showing all properties
              </span>
            )}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" /> Add Area
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={activeFilter}
            onValueChange={(v) => setActiveFilter(v as any)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-sm text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader className="mr-2 h-4 w-4 animate-spin" /> Loading areas…
          </div>
        ) : areas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <MapPin className="h-8 w-8 text-gray-300" />
            <p>No areas found</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add your first area
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {areas.map((area) => (
                <article
                  key={area.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-foreground">
                        {area.name}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {area.property_name || "No property"}
                      </p>
                    </div>
                    {area.is_active ? (
                      <Badge
                        variant="default"
                        className="bg-green-100 text-green-800 hover:bg-green-100"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {area.description ? (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {area.description}
                    </p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {area.jobs_count ?? 0} jobs
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(area)}
                        aria-label={`Edit ${area.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(area)}
                        aria-label={`Delete ${area.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <table className="hidden min-w-full text-sm md:table">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Property</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Jobs</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {areas.map((area) => (
                  <tr key={area.id} className="hover:bg-muted">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {area.name}
                      </div>
                      {area.description ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {area.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {area.property_name || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {area.is_active ? (
                        <Badge
                          variant="default"
                          className="bg-green-100 text-green-800 hover:bg-green-100"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {area.jobs_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(area)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(area)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Area" : "Add Area"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Property</Label>
              <Select
                value={form.property_id}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, property_id: v }))
                }
                disabled={Boolean(form.id)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {propertyOptions.map((p) => (
                    <SelectItem key={String(p.id)} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Lobby, Pump Room"
                maxLength={150}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, is_active: e.target.checked }))
                }
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
              {form.id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate area?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark the area “{deleteTarget?.name}” as inactive. Existing
            jobs keep their reference.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AreasClient;

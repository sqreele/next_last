"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useProperties, useUser } from "@/app/lib/stores/mainStore";
import type { Area } from "@/app/lib/types";

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
  const { selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const { toast } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AreaFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null);
  const requestIdRef = useRef(0);
  const selectedPropertyRef = useRef(selectedPropertyId);
  selectedPropertyRef.current = selectedPropertyId;

  const selectedPropertyName = useMemo(() => {
    if (!selectedPropertyId) return null;
    const match = properties.find(
      (property) => property.property_id === selectedPropertyId,
    );
    return match?.name || null;
  }, [selectedPropertyId, properties]);

  const fetchAreas = useCallback(
    async (signal?: AbortSignal, requestId = requestIdRef.current) => {
      if (!selectedPropertyId) {
        setAreas([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {
          property_id: selectedPropertyId,
        };
        if (activeFilter !== "all")
          params.is_active = String(activeFilter === "active");
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

        const res = await axios.get("/api/areas/", {
          params,
          withCredentials: true,
          signal,
        });
        const data = res.data;
        const list: Area[] = Array.isArray(data) ? data : data?.results || [];
        if (requestId === requestIdRef.current) setAreas(list);
      } catch (err) {
        if (axios.isCancel(err)) return;
        if (requestId === requestIdRef.current) {
          setError(getErrorMessage(err, "Failed to load areas"));
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [selectedPropertyId, activeFilter, debouncedSearch],
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setAreas([]);
    setDialogOpen(false);
    setDeleteTarget(null);
    setForm(emptyForm);
    void fetchAreas(controller.signal, requestId);
    return () => controller.abort();
  }, [fetchAreas]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      property_id: selectedPropertyId || "",
    });
    setDialogOpen(true);
  };

  const openEdit = (area: Area) => {
    setForm({
      id: area.id,
      name: area.name,
      description: area.description || "",
      property_id: area.property_uuid || selectedPropertyId || "",
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
    const mutationProperty = selectedPropertyId;
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        property_id: form.property_id,
      };
      if (form.id) {
        await axios.patch(`/api/areas/${form.id}/`, payload, {
          withCredentials: true,
        });
      } else {
        await axios.post("/api/areas/", payload, { withCredentials: true });
      }
      if (mutationProperty !== selectedPropertyRef.current) return;
      toast({
        title: form.id ? "Area updated" : "Area created",
        variant: "success",
      });
      setDialogOpen(false);
      setForm(emptyForm);
      fetchAreas();
    } catch (err) {
      if (mutationProperty !== selectedPropertyRef.current) return;
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
    const mutationProperty = selectedPropertyId;
    try {
      await axios.delete(`/api/areas/${deleteTarget.id}/`, {
        withCredentials: true,
      });
      if (mutationProperty !== selectedPropertyRef.current) return;
      toast({ title: "Area deactivated", variant: "success" });
      setDeleteTarget(null);
      fetchAreas();
    } catch (err) {
      if (mutationProperty !== selectedPropertyRef.current) return;
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to delete area"),
        variant: "destructive",
      });
    }
  };

  if (!selectedPropertyId) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Areas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a property to view areas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            ) : null}
          </p>
        </div>
        <Button onClick={openCreate} className="w-full gap-1 sm:w-auto">
          <Plus className="h-4 w-4" /> Add Area
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 sm:p-4">
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
              className="pl-8 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
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

      {!loading && !error && (
        <p className="text-xs font-medium text-muted-foreground">
          {areas.length} area{areas.length === 1 ? "" : "s"} found
        </p>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
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
                      <h3 className="break-words text-base font-bold text-foreground">
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
                        className="min-h-11 min-w-11"
                        aria-label={`Edit ${area.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(area)}
                        className="min-h-11 min-w-11"
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
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {selectedPropertyName || selectedPropertyId}
              </div>
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

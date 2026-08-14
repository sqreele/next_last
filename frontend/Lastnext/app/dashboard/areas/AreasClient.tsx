"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { useToast } from "@/app/components/ui/use-toast";
import { useUser } from "@/app/lib/stores/mainStore";
import type {
  ApiErrorDetails,
  AreaApiResponse as Area,
  AreaWritePayload,
  PropertyApiResponse as Property,
  PropertyRef,
} from "@/app/lib/types";

type AreaFormState = {
  id?: number;
  name: string;
  description: string;
  property_id: string;
  is_active: boolean;
};

type DeleteTarget = {
  area: Area;
  originSelectedPropertyId: string | null;
};

type LegacyProfileProperty = {
  id: string | number;
  property_id: string;
  name: string;
};

const emptyForm: AreaFormState = {
  name: "",
  description: "",
  property_id: "",
  is_active: true,
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data;
    if (!data) return err.message || fallback;
    if (typeof data === "string") return data;
    if (typeof data !== "object" || data === null) return err.message || fallback;
    if ("detail" in data && typeof data.detail === "string") return data.detail;
    const fieldMsgs = Object.entries(data as ApiErrorDetails)
      .filter(([k]) => k !== "detail")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    return fieldMsgs.length ? fieldMsgs.join(" | ") : err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

function isAreaMutationResponse(
  value: unknown,
  propertyPk: number,
  areaId?: number,
  expectedActive?: boolean,
): value is Area {
  if (typeof value !== "object" || value === null) return false;
  const area = value as Partial<Area>;
  return typeof area.id === "number"
    && (areaId === undefined || area.id === areaId)
    && area.property === propertyPk
    && typeof area.name === "string"
    && typeof area.is_active === "boolean"
    && (expectedActive === undefined || area.is_active === expectedActive);
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AreaFormState>(emptyForm);
  const [formOriginSelectedPropertyId, setFormOriginSelectedPropertyId] =
    useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const areaRequestIdRef = useRef(0);
  const areaAbortRef = useRef<AbortController | null>(null);
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const selectedPropertyIdRef = useRef<string | null>(selectedPropertyId);
  selectedPropertyIdRef.current = selectedPropertyId;

  const propertyOptions = useMemo<Array<PropertyRef | LegacyProfileProperty>>(() => {
    if (properties.length) return properties;
    return userProfile?.properties || [];
  }, [properties, userProfile]);

  // Map the globally selected property_id (string like "P1A2B3C4") to the
  // integer PK that the areas API expects.
  const selectedPropertyPk = useMemo<string | null>(() => {
    if (!selectedPropertyId) return null;
    const match = propertyOptions.find(
      (p) =>
        String(p.property_id) === String(selectedPropertyId) ||
        String(p.id) === String(selectedPropertyId),
    );
    if (!match) return null;
    return String(match.id);
  }, [selectedPropertyId, propertyOptions]);

  const selectedPropertyName = useMemo(() => {
    if (!selectedPropertyId) return null;
    const match = propertyOptions.find(
      (p) =>
        String(p.property_id) === String(selectedPropertyId) ||
        String(p.id) === String(selectedPropertyId),
    );
    return match?.name || null;
  }, [selectedPropertyId, propertyOptions]);

  const fetchAreas = useCallback(async () => {
    const requestId = areaRequestIdRef.current + 1;
    areaRequestIdRef.current = requestId;
    areaAbortRef.current?.abort();
    const controller = new AbortController();
    areaAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (selectedPropertyId) params.property_id = selectedPropertyId;
      if (activeFilter !== "all")
        params.is_active = String(activeFilter === "active");
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await axios.get<Area[] | { results: Area[] }>("/api/areas/", {
        params,
        signal: controller.signal,
        withCredentials: true,
      });
      if (!mountedRef.current || requestId !== areaRequestIdRef.current) return;
      const data = res.data;
      const list: Area[] = Array.isArray(data) ? data : data?.results || [];
      setAreas(list);
    } catch (err) {
      if (
        !mountedRef.current ||
        requestId !== areaRequestIdRef.current ||
        axios.isCancel(err)
      ) return;
      setError(getErrorMessage(err, "Failed to load areas"));
    } finally {
      if (mountedRef.current && requestId === areaRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [selectedPropertyId, activeFilter, debouncedSearch]);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await axios.get<Property[] | { results: Property[] }>("/api/properties/", {
        withCredentials: true,
      });
      const data = res.data;
      const list: Property[] = Array.isArray(data) ? data : data?.results || [];
      if (mountedRef.current) setProperties(list);
    } catch {
      // Fall back to user profile properties
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    void fetchAreas();
  }, [fetchAreas, refreshVersion]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      areaAbortRef.current?.abort();
    };
  }, []);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      property_id:
        selectedPropertyPk ||
        (propertyOptions[0]?.id != null ? String(propertyOptions[0].id) : ""),
    });
    setFormOriginSelectedPropertyId(selectedPropertyId);
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
    setFormOriginSelectedPropertyId(selectedPropertyId);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
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
    const propertyPk = Number(form.property_id);
    if (!Number.isInteger(propertyPk) || propertyPk <= 0) {
      toast({
        title: "Validation",
        description: "Property is invalid",
        variant: "destructive",
      });
      return;
    }
    const areaId = form.id;
    const originSelectedPropertyId = formOriginSelectedPropertyId;
    const propertyName = propertyOptions.find(
      (property) => String(property.id) === String(propertyPk),
    )?.name;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const payload: AreaWritePayload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        property_id: propertyPk,
      };
      let response: { data: unknown };
      if (areaId !== undefined) {
        response = await axios.patch(`/api/areas/${areaId}/`, payload, {
          withCredentials: true,
        });
      } else {
        response = await axios.post("/api/areas/", payload, {
          withCredentials: true,
        });
      }
      if (!isAreaMutationResponse(response.data, propertyPk, areaId)) {
        throw new Error("Invalid Area response contract");
      }
      if (!mountedRef.current) return;
      toast({
        title: areaId !== undefined ? "Area updated" : "Area created",
        description: propertyName ? `Property: ${propertyName}` : undefined,
        variant: "success",
      });
      if (selectedPropertyIdRef.current === originSelectedPropertyId) {
        setRefreshVersion((version) => version + 1);
      }
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (err) {
      if (!mountedRef.current) return;
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to save area"),
        variant: "destructive",
      });
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteInFlightRef.current) return;
    const { area, originSelectedPropertyId } = deleteTarget;
    deleteInFlightRef.current = true;
    setDeleting(true);
    try {
      const response = await axios.delete(`/api/areas/${area.id}/`, {
        withCredentials: true,
      });
      if (!isAreaMutationResponse(response.data, area.property, area.id, false)) {
        throw new Error("Invalid Area deactivate response contract");
      }
      if (!mountedRef.current) return;
      toast({
        title: "Area deactivated",
        description: area.property_name ? `Property: ${area.property_name}` : undefined,
        variant: "success",
      });
      if (selectedPropertyIdRef.current === originSelectedPropertyId) {
        setRefreshVersion((version) => version + 1);
      }
      setDeleteTarget(null);
    } catch (err) {
      if (!mountedRef.current) return;
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to delete area"),
        variant: "destructive",
      });
    } finally {
      deleteInFlightRef.current = false;
      if (mountedRef.current) setDeleting(false);
    }
  };

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
            ) : (
              <span className="ml-1 text-muted-foreground">
                Showing all properties
              </span>
            )}
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
            onValueChange={(v: "all" | "active" | "inactive") => setActiveFilter(v)}
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
                        onClick={() => setDeleteTarget({
                          area,
                          originSelectedPropertyId: selectedPropertyId,
                        })}
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
                        onClick={() => setDeleteTarget({
                          area,
                          originSelectedPropertyId: selectedPropertyId,
                        })}
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saveInFlightRef.current) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Area" : "Add Area"}</DialogTitle>
            <DialogDescription>
              {form.id
                ? "Update this Area within its original Property."
                : "Create an Area for the selected Property."}
            </DialogDescription>
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
              onClick={() => {
                if (!saveInFlightRef.current) setDialogOpen(false);
              }}
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
        onOpenChange={(open) => {
          if (!open && !deleteInFlightRef.current) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate area?</DialogTitle>
            <DialogDescription>
              This action keeps existing Job references and marks only the
              selected Area inactive.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark the area “{deleteTarget?.area.name}” as inactive.
            Existing jobs keep their reference.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!deleteInFlightRef.current) setDeleteTarget(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AreasClient;

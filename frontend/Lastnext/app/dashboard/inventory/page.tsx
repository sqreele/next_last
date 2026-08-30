"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/lib/session.client";
import { useUser } from "@/app/lib/stores/mainStore";
import apiClient from "@/app/lib/api-client";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { PageContainer } from "@/app/components/layout/PageContainer";
import {
  DashboardKpiSkeleton,
  SkeletonList,
} from "@/app/components/ui/loading";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Package,
  Search,
  MapPin,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Filter,
  Minus,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingCart,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { InventoryMobileStats } from "@/app/components/inventory/InventoryMobileStats";
import { InventoryCsvImport } from "@/app/components/inventory/InventoryCsvImport";
import { useT } from "@/app/lib/i18n/LocaleProvider";

interface InventoryItem {
  id: number;
  item_id: string;
  name: string;
  description?: string;
  category: string;
  category_display?: string;
  quantity: number;
  min_quantity: number;
  max_quantity?: number;
  unit: string;
  unit_price?: number;
  location?: string;
  supplier?: string;
  supplier_contact?: string;
  status: string;
  status_display?: string;
  property_id?: string;
  property_name?: string;
  room_id?: string;
  room_name?: string;
  job_id?: string;
  job_description?: string;
  pm_id?: string;
  pm_title?: string;
  last_job_by_user?: {
    job_id: string;
    description: string;
    full_description: string;
  } | null;
  last_pm_by_user?: {
    pm_id: string;
    title: string;
    full_title: string;
  } | null;
  image_url?: string;
  last_restocked?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: "border-success/30 bg-success/10 text-success",
  low_stock: "border-warning/30 bg-warning/10 text-warning-emphasis",
  out_of_stock: "border-destructive/30 bg-destructive/10 text-destructive",
  reserved: "border-info/30 bg-info/10 text-info",
  maintenance: "border-border bg-muted text-foreground",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  tools: "🔧",
  parts: "⚙️",
  supplies: "📦",
  equipment: "🛠️",
  consumables: "🧴",
  safety: "🦺",
  other: "📋",
};

export default function InventoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useT();
  const { selectedPropertyId: selectedProperty } = useUser();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>("all");
  const [selectedPmFilter, setSelectedPmFilter] = useState<string>("all");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [rooms, setRooms] = useState<
    Array<{ room_id: string; roomname: string }>
  >([]);
  const [jobsForFilter, setJobsForFilter] = useState<
    Array<{ job_id: string; description: string }>
  >([]);
  const [pmsForFilter, setPmsForFilter] = useState<
    Array<{ pm_id: string; pmtitle: string }>
  >([]);
  const [categoryOptions, setCategoryOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [statusOptions, setStatusOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [showUseDialog, setShowUseDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [useQuantity, setUseQuantity] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedPmId, setSelectedPmId] = useState<string>("");
  const [userJobs, setUserJobs] = useState<
    Array<{ job_id: string; description: string }>
  >([]);
  const [userPMs, setUserPMs] = useState<
    Array<{ pm_id: string; pmtitle: string }>
  >([]);
  const [loadingJobsPMs, setLoadingJobsPMs] = useState(false);
  const [stockMutationPending, setStockMutationPending] = useState(false);
  const [stockMutationError, setStockMutationError] = useState<string | null>(
    null,
  );
  const [addPending, setAddPending] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "other",
    description: "",
    quantity: "0",
    min_quantity: "0",
    unit: "pcs",
    location: "",
    supplier: "",
  });
  const requestIdRef = useRef(0);
  const selectedPropertyRef = useRef(selectedProperty);
  selectedPropertyRef.current = selectedProperty;

  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoading);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    setInventory([]);
    setRooms([]);
    setJobsForFilter([]);
    setPmsForFilter([]);
    setUserJobs([]);
    setUserPMs([]);
    setSelectedJobId("");
    setSelectedPmId("");
    setSelectedItem(null);
    setShowRestockDialog(false);
    setShowUseDialog(false);
    setShowAddDialog(false);
    setStockMutationError(null);
    setSelectedCategory("all");
    setSelectedStatus("all");
    setSelectedRoom("all");
    setLowStockOnly(false);
    setSelectedJobFilter("all");
    setSelectedPmFilter("all");
    setSearchTerm("");
  }, [selectedProperty]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setInventory([]);
    if (!selectedProperty) {
      setLoading(false);
      return () => controller.abort();
    }
    void fetchInventory(controller.signal, requestId);
    return () => controller.abort();
  }, [
    status,
    selectedProperty,
    page,
    pageSize,
    selectedCategory,
    selectedStatus,
    selectedRoom,
    lowStockOnly,
    selectedJobFilter,
    selectedPmFilter,
    searchTerm,
  ]);

  // Fetch filter options (categories, statuses) from backend
  useEffect(() => {
    const fetchInventoryFilterOptions = async () => {
      if (status !== "authenticated") return;

      try {
        const response = await apiClient.get(
          "/api/v1/inventory/filter_options/",
        );
        if (response.data) {
          setCategoryOptions(response.data.categories || []);
          setStatusOptions(response.data.statuses || []);
        }
      } catch (err: any) {
        console.error("Error fetching inventory filter options:", err);
        // Fallback to default options if API fails
        setCategoryOptions([
          { value: "tools", label: "Tools" },
          { value: "parts", label: "Parts" },
          { value: "supplies", label: "Supplies" },
          { value: "equipment", label: "Equipment" },
          { value: "consumables", label: "Consumables" },
          { value: "safety", label: "Safety Equipment" },
          { value: "other", label: "Other" },
        ]);
        setStatusOptions([
          { value: "available", label: "Available" },
          { value: "low_stock", label: "Low Stock" },
          { value: "out_of_stock", label: "Out of Stock" },
          { value: "reserved", label: "Reserved" },
          { value: "maintenance", label: "Under Maintenance" },
        ]);
      }
    };

    fetchInventoryFilterOptions();
  }, [status]);

  // Fetch rooms, jobs, and PMs for filters when property changes or on load
  useEffect(() => {
    const controller = new AbortController();
    const fetchFilterOptions = async () => {
      if (status !== "authenticated" || !selectedProperty) {
        setRooms([]);
        setJobsForFilter([]);
        setPmsForFilter([]);
        return;
      }

      try {
        // Fetch rooms for the selected property
        const roomParams: any = { page_size: 100 };
        if (selectedProperty) {
          roomParams.property_id = selectedProperty;
        }
        const roomsResponse = await apiClient.get("/api/v1/rooms/", {
          params: roomParams,
          signal: controller.signal,
        });
        const roomsData = Array.isArray(roomsResponse.data)
          ? roomsResponse.data
          : roomsResponse.data?.results || [];
        if (selectedProperty !== selectedPropertyRef.current) return;
        setRooms(
          roomsData.map((room: any) => ({
            room_id: room.room_id,
            roomname: room.roomname || room.room_id,
          })),
        );

        // Fetch jobs for filter
        const jobsResponse = await apiClient.get("/api/v1/jobs/", {
          params: {
            page_size: 100,
            ordering: "-updated_at",
            ...(selectedProperty ? { property_id: selectedProperty } : {}),
          },
          signal: controller.signal,
        });
        const jobsData = Array.isArray(jobsResponse.data)
          ? jobsResponse.data
          : jobsResponse.data?.results || [];
        if (selectedProperty !== selectedPropertyRef.current) return;
        setJobsForFilter(
          jobsData.map((job: any) => ({
            job_id: job.job_id,
            description: job.description || "",
          })),
        );

        // Fetch PMs for filter
        const pmResponse = await apiClient.get(
          "/api/v1/preventive-maintenance/",
          {
            params: {
              page_size: 100,
              ordering: "-updated_at",
              ...(selectedProperty ? { property_id: selectedProperty } : {}),
            },
            signal: controller.signal,
          },
        );
        const pmData = Array.isArray(pmResponse.data)
          ? pmResponse.data
          : pmResponse.data?.results || [];
        if (selectedProperty !== selectedPropertyRef.current) return;
        setPmsForFilter(
          pmData.map((pm: any) => ({
            pm_id: pm.pm_id,
            pmtitle: pm.pmtitle || "",
          })),
        );
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED") return;
        console.error("Error fetching filter options:", err);
      }
    };

    void fetchFilterOptions();
    return () => controller.abort();
  }, [status, selectedProperty]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [
    selectedProperty,
    selectedCategory,
    selectedStatus,
    selectedRoom,
    lowStockOnly,
    selectedJobFilter,
    selectedPmFilter,
    searchTerm,
  ]);

  // Fetch user's jobs and PMs when use dialog opens
  useEffect(() => {
    const controller = new AbortController();
    const fetchUserJobsAndPMs = async () => {
      if (!showUseDialog || status !== "authenticated" || !selectedProperty) {
        setUserJobs([]);
        setUserPMs([]);
        return;
      }

      setLoadingJobsPMs(true);
      try {
        // Fetch user's recent jobs
        const jobsResponse = await apiClient.get("/api/v1/jobs/my_jobs/", {
          params: {
            page_size: 50,
            ordering: "-updated_at",
            ...(selectedProperty ? { property_id: selectedProperty } : {}),
          },
          signal: controller.signal,
        });
        const jobsData = Array.isArray(jobsResponse.data)
          ? jobsResponse.data
          : jobsResponse.data?.results || [];
        if (selectedProperty !== selectedPropertyRef.current) return;
        setUserJobs(
          jobsData.map((job: any) => ({
            job_id: job.job_id,
            description: job.description || "",
          })),
        );

        // Fetch user's PMs (assigned to or created by user)
        const pmResponse = await apiClient.get(
          "/api/v1/preventive-maintenance/",
          {
            params: {
              page_size: 50,
              ordering: "-updated_at",
              ...(selectedProperty ? { property_id: selectedProperty } : {}),
            },
            signal: controller.signal,
          },
        );
        const pmData = Array.isArray(pmResponse.data)
          ? pmResponse.data
          : pmResponse.data?.results || [];
        if (selectedProperty !== selectedPropertyRef.current) return;
        setUserPMs(
          pmData.map((pm: any) => ({
            pm_id: pm.pm_id,
            pmtitle: pm.pmtitle || "",
          })),
        );

        // Pre-select last used job/PM if available
        if (selectedItem) {
          if (selectedItem.last_job_by_user) {
            setSelectedJobId(selectedItem.last_job_by_user.job_id);
          }
          if (selectedItem.last_pm_by_user) {
            setSelectedPmId(selectedItem.last_pm_by_user.pm_id);
          }
        }
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED") return;
        console.error("Error fetching jobs/PMs:", err);
      } finally {
        if (selectedProperty === selectedPropertyRef.current) {
          setLoadingJobsPMs(false);
        }
      }
    };

    void fetchUserJobsAndPMs();
    return () => controller.abort();
  }, [showUseDialog, status, selectedItem, selectedProperty]);

  const fetchInventory = async (
    signal?: AbortSignal,
    requestId = requestIdRef.current,
  ) => {
    if (!selectedProperty) return;
    recordLoaderShown();
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page: page,
        page_size: pageSize,
      };
      params.property_id = selectedProperty;
      if (selectedCategory !== "all") {
        params.category = selectedCategory;
      }
      if (selectedStatus !== "all") {
        params.status = selectedStatus;
      }
      if (selectedRoom !== "all") {
        params.room_id = selectedRoom;
      }
      if (lowStockOnly) {
        params.low_stock = "true";
      }
      if (selectedJobFilter !== "all") {
        params.job_id = selectedJobFilter;
      }
      if (selectedPmFilter !== "all") {
        params.pm_id = selectedPmFilter;
      }
      // Send search term to backend for proper pagination
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await apiClient.get("/api/v1/inventory/", {
        params,
        signal,
      });

      let inventoryData: InventoryItem[] = [];
      let total = 0;
      let pages = 1;

      if (Array.isArray(response.data)) {
        inventoryData = response.data;
        total = response.data.length;
        pages = Math.ceil(total / pageSize);
      } else if (response.data && "results" in response.data) {
        inventoryData = response.data.results || [];
        total = response.data.count || 0;
        pages =
          response.data.total_pages ||
          Math.ceil(total / (response.data.page_size || pageSize));
      }

      if (requestId === requestIdRef.current) {
        setTotalCount(total);
        setTotalPages(pages);
        setInventory(inventoryData);
      }
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED") return;
      console.error("Error fetching inventory:", err);
      if (requestId === requestIdRef.current) {
        setError(err.message || "Failed to load inventory");
        setInventory([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } finally {
      if (requestId === requestIdRef.current) clearLoadingAfterMinTime();
    }
  };

  // No need for client-side filtering - backend handles it via search param
  // Keep filteredInventory for backward compatibility but use inventory directly
  const filteredInventory = inventory;

  const handleRestock = async () => {
    if (!selectedItem || !restockQuantity || stockMutationPending) return;

    setStockMutationPending(true);
    setStockMutationError(null);
    const mutationProperty = selectedProperty;
    try {
      const response = await apiClient.post(
        `/api/v1/inventory/${selectedItem.item_id}/restock/`,
        {
          quantity: parseInt(restockQuantity),
        },
      );
      if (mutationProperty !== selectedPropertyRef.current) return;
      const authoritative = response.data as InventoryItem;
      setInventory((items) =>
        items.map((item) =>
          item.item_id === authoritative.item_id ? authoritative : item,
        ),
      );
      setShowRestockDialog(false);
      setRestockQuantity("");
      setSelectedItem(null);
      void fetchInventory();
    } catch (err: any) {
      console.error("Error restocking:", err);
      if (mutationProperty === selectedPropertyRef.current) {
        setStockMutationError(
          err.response?.data?.error || "Failed to restock item",
        );
      }
    } finally {
      setStockMutationPending(false);
    }
  };

  const handleUse = async () => {
    if (!selectedItem || !useQuantity || stockMutationPending) return;

    setStockMutationPending(true);
    setStockMutationError(null);
    const mutationProperty = selectedProperty;
    try {
      const payload: any = {
        quantity: parseInt(useQuantity),
      };

      // Add job_id or pm_id if selected
      if (selectedJobId) {
        payload.job_id = selectedJobId;
      }
      if (selectedPmId) {
        payload.pm_id = selectedPmId;
      }

      await apiClient.post(
        `/api/v1/inventory/${selectedItem.item_id}/consume/`,
        payload,
      );
      if (mutationProperty !== selectedPropertyRef.current) return;
      setShowUseDialog(false);
      setUseQuantity("");
      setSelectedJobId("");
      setSelectedPmId("");
      setSelectedItem(null);
      void fetchInventory();
    } catch (err: any) {
      console.error("Error using item:", err);
      if (mutationProperty === selectedPropertyRef.current) {
        setStockMutationError(
          err.response?.data?.error ||
            err.response?.data?.detail ||
            err.response?.data?.inventory_usage ||
            "Failed to use item",
        );
      }
    } finally {
      setStockMutationPending(false);
    }
  };

  const handleAddItem = async () => {
    if (!selectedProperty || !newItem.name.trim() || addPending) return;
    setAddPending(true);
    const mutationProperty = selectedProperty;
    try {
      await apiClient.post("/api/v1/inventory/", {
        ...newItem,
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        location: newItem.location.trim() || null,
        supplier: newItem.supplier.trim() || null,
        quantity: Number.parseInt(newItem.quantity, 10) || 0,
        min_quantity: Number.parseInt(newItem.min_quantity, 10) || 0,
        property_id: selectedProperty,
      });
      if (mutationProperty !== selectedPropertyRef.current) return;
      setShowAddDialog(false);
      setNewItem({
        name: "",
        category: "other",
        description: "",
        quantity: "0",
        min_quantity: "0",
        unit: "pcs",
        location: "",
        supplier: "",
      });
      void fetchInventory();
    } catch (err: any) {
      if (mutationProperty === selectedPropertyRef.current) {
        setStockMutationError(
          err.response?.data?.detail || "Failed to add inventory item",
        );
      }
    } finally {
      setAddPending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colorClass =
      STATUS_COLORS[status] || "bg-muted text-foreground border-border";
    const statusText = status
      .replace("_", " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    return (
      <Badge className={`${colorClass} gap-1 whitespace-nowrap`}>
        {status === "available" && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
        {status === "low_stock" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
        {status === "out_of_stock" && <XCircle className="h-3 w-3" aria-hidden="true" />}
        {status === "reserved" && <Clock className="h-3 w-3" aria-hidden="true" />}
        {statusText}
      </Badge>
    );
  };

  if (status === "loading" || loading) {
    return (
      <PageContainer aria-busy="true" aria-label="Loading inventory">
        <DashboardKpiSkeleton />
        <SkeletonList rows={6} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <FeedbackState
          variant="error"
          title="Unable to load inventory"
          description={error}
          action={
            <Button onClick={() => void fetchInventory()}>Try again</Button>
          }
        />
      </PageContainer>
    );
  }

  if (!selectedProperty) {
    return (
      <PageContainer>
        <FeedbackState
          variant="empty"
          title="Select a property"
          description="Select a property to view inventory."
        />
      </PageContainer>
    );
  }

  const lowStockCount = inventory.filter(
    (item) => item.status === "low_stock" || item.status === "out_of_stock",
  ).length;
  const activeFilterCount = [
    selectedCategory !== "all",
    selectedStatus !== "all",
    selectedRoom !== "all",
    lowStockOnly,
    selectedJobFilter !== "all",
    selectedPmFilter !== "all",
  ].filter(Boolean).length;
  const parsedUseQuantity = Number.parseInt(useQuantity, 10) || 0;
  const remainingQuantity = selectedItem
    ? Math.max(0, selectedItem.quantity - parsedUseQuantity)
    : 0;
  const invalidUseQuantity =
    parsedUseQuantity <= 0 ||
    (selectedItem ? parsedUseQuantity > selectedItem.quantity : true);

  return (
    <PageContainer className="max-w-7xl space-y-5 desktop:max-w-[94rem]">
      {/* Header */}
      <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Inventory workspace</p>
          <div className="mb-1 flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="break-words text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {t("inventory.title")}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {totalCount} {t("inventory.itemsTotal")}
            {lowStockCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-warning-emphasis">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                ({lowStockCount} {t("inventory.lowStockWarning")})
              </span>
            )}
            {(searchTerm ||
              selectedCategory !== "all" ||
              selectedStatus !== "all" ||
              selectedRoom !== "all" ||
              lowStockOnly ||
              selectedJobFilter !== "all" ||
              selectedPmFilter !== "all") &&
              ` (${filteredInventory.length} filtered)`}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:items-center">
          <InventoryCsvImport
            currentPropertyId={selectedProperty}
            onImported={() => void fetchInventory()}
          />
          <Dialog
            open={showAddDialog}
            onOpenChange={(open) => {
              setShowAddDialog(open);
              setStockMutationError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-4 sm:max-w-2xl sm:p-6">
              <DialogHeader>
                <DialogTitle>Add New Inventory Item</DialogTitle>
                <DialogDescription>
                  Create a new inventory item for tracking
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {stockMutationError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {stockMutationError}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Item Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter item name"
                      value={newItem.name}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={newItem.category}
                      onValueChange={(category) =>
                        setNewItem((item) => ({ ...item, category }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Enter description"
                    value={newItem.description}
                    onChange={(event) =>
                      setNewItem((item) => ({
                        ...item,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="quantity">Initial Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      value={newItem.quantity}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          quantity: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="min_quantity">Min Quantity</Label>
                    <Input
                      id="min_quantity"
                      type="number"
                      min="0"
                      value={newItem.min_quantity}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          min_quantity: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={newItem.unit}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          unit: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="Storage location"
                      value={newItem.location}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          location: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplier">Supplier</Label>
                    <Input
                      id="supplier"
                      placeholder="Supplier name"
                      value={newItem.supplier}
                      onChange={(event) =>
                        setNewItem((item) => ({
                          ...item,
                          supplier: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleAddItem()}
                  disabled={addPending || !newItem.name.trim()}
                >
                  {addPending ? "Adding…" : "Add Item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Mobile-first stats strip — tap Low Stock to filter without scrolling */}
      <InventoryMobileStats
        items={inventory}
        total={totalCount}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => {
          setLowStockOnly((value) => !value);
          setPage(1);
        }}
      />

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4">
            {/* First Row: Search and View Toggle */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="text"
                  aria-label="Search inventory"
                  placeholder="Search by name, ID, location, supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-11 rounded-lg pl-10"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Inventory view">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="h-9 min-h-9 rounded-md px-3"
                  aria-label="Show inventory as cards"
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="h-9 min-h-9 rounded-md px-3"
                  aria-label="Show inventory as a list"
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant={activeFilterCount > 0 ? "default" : "outline"}
              onClick={() => setShowMobileFilters((value) => !value)}
              className="min-h-11 w-full justify-between sm:hidden"
              aria-expanded={showMobileFilters}
            >
              <span className="inline-flex items-center gap-2">
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filters
              </span>
              <span className="text-xs font-bold">
                {activeFilterCount > 0
                  ? `${activeFilterCount} active`
                  : showMobileFilters
                    ? "Hide"
                    : "Show"}
              </span>
            </Button>

            {/* Second Row: All Filters */}
            <div
              className={`${showMobileFilters ? "grid" : "hidden"} gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:bg-transparent sm:p-0`}
            >
              <Filter className="hidden h-5 w-5 text-muted-foreground sm:block" aria-hidden="true" />

              {/* Category Filter */}
              <Select
                value={selectedCategory}
                onValueChange={(value) => {
                  setSelectedCategory(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-full rounded-lg sm:w-[150px]" aria-label="Filter by category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select
                value={selectedStatus}
                onValueChange={(value) => {
                  setSelectedStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-full rounded-lg sm:w-[150px]" aria-label="Filter by status">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statusOptions.map((stat) => (
                    <SelectItem key={stat.value} value={stat.value}>
                      {stat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Room Filter */}
              <Select
                value={selectedRoom}
                onValueChange={(value) => {
                  setSelectedRoom(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-full rounded-lg sm:w-[150px]" aria-label="Filter by room">
                  <SelectValue placeholder="All Rooms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rooms</SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.room_id} value={room.room_id}>
                      {room.roomname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Job Filter */}
              <Select
                value={selectedJobFilter}
                onValueChange={(value) => {
                  setSelectedJobFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-full rounded-lg sm:w-[180px]" aria-label="Filter by job">
                  <SelectValue placeholder="All Jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  {jobsForFilter.map((job) => (
                    <SelectItem key={job.job_id} value={job.job_id}>
                      {job.job_id} -{" "}
                      {job.description?.substring(0, 30) || "No desc"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* PM Filter */}
              <Select
                value={selectedPmFilter}
                onValueChange={(value) => {
                  setSelectedPmFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-full rounded-lg sm:w-[180px]" aria-label="Filter by preventive maintenance">
                  <SelectValue placeholder="All PMs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pmsForFilter.map((pm) => (
                    <SelectItem key={pm.pm_id} value={pm.pm_id}>
                      {pm.pm_id} - {pm.pmtitle?.substring(0, 30) || "No title"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Low Stock Toggle */}
              <Button
                variant={lowStockOnly ? "warning" : "outline"}
                size="sm"
                onClick={() => {
                  setLowStockOnly(!lowStockOnly);
                  setPage(1);
                }}
                className="min-h-11 gap-2"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t("inventory.lowStockOnly")}
              </Button>

              {/* Clear Filters */}
              {(selectedCategory !== "all" ||
                selectedStatus !== "all" ||
                selectedRoom !== "all" ||
                lowStockOnly ||
                selectedJobFilter !== "all" ||
                selectedPmFilter !== "all" ||
                searchTerm) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedStatus("all");
                    setSelectedRoom("all");
                    setLowStockOnly(false);
                    setSelectedJobFilter("all");
                    setSelectedPmFilter("all");
                    setSearchTerm("");
                    setPage(1);
                    setShowMobileFilters(false);
                  }}
                  className="min-h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                >
                  <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("inventory.clearFilters")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Grid/List */}
      {filteredInventory.length === 0 ? (
        <FeedbackState
          variant={
            searchTerm ||
            selectedCategory !== "all" ||
            selectedStatus !== "all" ||
            selectedRoom !== "all" ||
            lowStockOnly ||
            selectedJobFilter !== "all" ||
            selectedPmFilter !== "all"
              ? "no-results"
              : "empty"
          }
          title={t("inventory.noItems")}
          description={
            searchTerm ||
            selectedCategory !== "all" ||
            selectedStatus !== "all" ||
            selectedRoom !== "all" ||
            lowStockOnly ||
            selectedJobFilter !== "all" ||
            selectedPmFilter !== "all"
              ? t("inventory.noItemsFiltered")
              : t("inventory.noItemsHint")
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredInventory.map((item) => (
            <Card key={item.id} variant="interactive" className="flex h-full flex-col overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {item.image_url ? (
                      <div className="shrink-0">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={item.image_url}
                          alt={item.name}
                          className="h-16 w-16 rounded-xl border border-border object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            if (target.nextElementSibling) {
                              (
                                target.nextElementSibling as HTMLElement
                              ).style.display = "flex";
                            }
                          }}
                        />
                        <div className="hidden h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/50 text-2xl">
                          {CATEGORY_ICONS[item.category] || "📋"}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-2xl">
                        {CATEGORY_ICONS[item.category] || "📋"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-semibold leading-5 text-foreground">
                        {item.name}
                      </h3>
                      <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">
                        {item.item_id}
                      </p>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current quantity</p>
                  <p className="mt-1 break-words text-2xl font-bold tabular-nums text-foreground">
                    {item.quantity} <span className="text-sm font-semibold text-muted-foreground">{item.unit}</span>
                  </p>
                  {item.min_quantity > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Minimum: {item.min_quantity} {item.unit}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(item.status)}
                  <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs">
                    {item.category_display || item.category}
                  </Badge>
                </div>

                {(item.property_name || item.location) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="break-words">
                      {[item.property_name, item.location].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}

                {item.room_name && (
                  <div className="break-words text-xs text-muted-foreground">
                    Room: {item.room_name}
                  </div>
                )}

                {item.last_job_by_user && (
                  <div className="break-words rounded-lg border border-info/20 bg-info/10 p-2 text-xs text-info">
                    <span className="font-semibold">Last job:</span>{" "}
                    {item.last_job_by_user.job_id} -{" "}
                    {item.last_job_by_user.description}
                  </div>
                )}

                {item.last_pm_by_user && (
                  <div className="break-words rounded-lg border border-primary/20 bg-primary/10 p-2 text-xs text-primary">
                    <span className="font-semibold">Last PM:</span>{" "}
                    {item.last_pm_by_user.pm_id} - {item.last_pm_by_user.title}
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSelectedItem(item);
                      setShowRestockDialog(true);
                    }}
                  >
                    <ShoppingCart className="mr-1 h-4 w-4" aria-hidden="true" />
                    Restock
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSelectedItem(item);
                      setShowUseDialog(true);
                    }}
                    disabled={item.quantity === 0}
                  >
                    Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid gap-3 p-3 xl:hidden">
              {filteredInventory.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-soft"
                >
                  <div className="flex gap-3">
                    <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 text-2xl">
                      {item.image_url ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={item.image_url}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        CATEGORY_ICONS[item.category] || "📋"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-bold leading-5 text-foreground">
                            {item.name}
                          </h3>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {item.item_id}
                          </p>
                        </div>
                        <span className="shrink-0">{getStatusBadge(item.status)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs">
                          {item.category_display || item.category}
                        </Badge>
                        {item.location ? (
                          <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left text-xs">
                            {item.location}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
                    <div className="flex items-end justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-muted-foreground">Quantity</span>
                      <strong className="break-words text-right text-xl tabular-nums text-foreground">
                        {item.quantity} <span className="text-xs font-semibold text-muted-foreground">{item.unit}</span>
                      </strong>
                    </div>
                    {(item.last_job_by_user || item.last_pm_by_user) && (
                      <div className="break-words rounded-xl border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                        {item.last_job_by_user ? (
                          <p>
                            <span className="font-semibold text-info">
                              Job:
                            </span>{" "}
                            {item.last_job_by_user.job_id}
                          </p>
                        ) : null}
                        {item.last_pm_by_user ? (
                          <p>
                            <span className="font-semibold text-primary">
                              PM:
                            </span>{" "}
                            {item.last_pm_by_user.pm_id}
                          </p>
                        ) : null}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowRestockDialog(true);
                        }}
                      >
                        Restock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowUseDialog(true);
                        }}
                        disabled={item.quantity === 0}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Item
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Quantity
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Location
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Last Job/PM
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredInventory.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <>
                              <img
                                loading="lazy"
                                decoding="async"
                                src={item.image_url}
                                alt={item.name}
                                className="h-12 w-12 rounded-xl border border-border object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = "none";
                                  if (target.nextElementSibling) {
                                    (
                                      target.nextElementSibling as HTMLElement
                                    ).style.display = "block";
                                  }
                                }}
                              />
                              <div className="text-2xl hidden">
                                {CATEGORY_ICONS[item.category] || "📋"}
                              </div>
                            </>
                          ) : (
                            <div className="text-2xl">
                              {CATEGORY_ICONS[item.category] || "📋"}
                            </div>
                          )}
                          <div className="min-w-0 max-w-64">
                            <div className="break-words text-sm font-semibold text-foreground">
                              {item.name}
                            </div>
                            <div className="break-all font-mono text-xs text-muted-foreground">
                              {item.item_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="secondary" className="max-w-44 whitespace-normal break-words text-left text-xs">
                          {item.category_display || item.category}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="text-sm tabular-nums">
                          <span className="text-lg font-bold text-foreground">
                            {item.quantity}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            {item.unit}
                          </span>
                          {item.min_quantity > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Min: {item.min_quantity}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-5 py-4">
                        {item.location ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="max-w-44 break-words">{item.location}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {item.last_job_by_user && (
                          <div className="mb-1 text-info">
                            <span className="font-semibold">Job:</span>{" "}
                            {item.last_job_by_user.job_id}
                            <div
                              className="max-w-52 break-words text-muted-foreground"
                              title={item.last_job_by_user.full_description}
                            >
                              {item.last_job_by_user.description}
                            </div>
                          </div>
                        )}
                        {item.last_pm_by_user && (
                          <div className="text-primary">
                            <span className="font-semibold">PM:</span>{" "}
                            {item.last_pm_by_user.pm_id}
                            <div
                              className="max-w-52 break-words text-muted-foreground"
                              title={item.last_pm_by_user.full_title}
                            >
                              {item.last_pm_by_user.title}
                            </div>
                          </div>
                        )}
                        {!item.last_job_by_user && !item.last_pm_by_user && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowRestockDialog(true);
                            }}
                          >
                            Restock
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowUseDialog(true);
                            }}
                            disabled={item.quantity === 0}
                          >
                            Use
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Restock Dialog */}
      <Dialog
        open={showRestockDialog}
        onOpenChange={(open) => {
          setShowRestockDialog(open);
          if (open) setStockMutationError(null);
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-4 sm:max-w-lg sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold">Restock Item</DialogTitle>
            <DialogDescription>
              Add quantity to {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {stockMutationError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
                {stockMutationError}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="restock-quantity" className="font-semibold">Quantity to Add</Label>
              <Input
                id="restock-quantity"
                type="number"
                min="1"
                value={restockQuantity}
                onChange={(e) => setRestockQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="h-12 rounded-xl text-lg font-bold tabular-nums"
              />
            </div>
            {selectedItem && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <span className="font-medium">Current:</span> {selectedItem.quantity} {selectedItem.unit}
                {restockQuantity && (
                  <span className="ml-2 font-semibold tabular-nums text-foreground">
                    → {selectedItem.quantity + parseInt(restockQuantity) || 0}{" "}
                    {selectedItem.unit}
                  </span>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="!grid grid-cols-2 gap-2 sm:!flex">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowRestockDialog(false);
                setRestockQuantity("");
                setSelectedItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRestock}
              className="w-full"
              disabled={
                stockMutationPending ||
                !restockQuantity ||
                parseInt(restockQuantity) <= 0
              }
            >
              {stockMutationPending ? "Restocking…" : "Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use Dialog */}
      <Dialog
        open={showUseDialog}
        onOpenChange={(open) => {
          setShowUseDialog(open);
          if (open) setStockMutationError(null);
          if (!open) {
            setUseQuantity("");
            setSelectedJobId("");
            setSelectedPmId("");
            setSelectedItem(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Use Item</DialogTitle>
            <DialogDescription>
              Record inventory used for a maintenance job.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/60 p-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-card text-2xl shadow-xs">
                {CATEGORY_ICONS[selectedItem.category] || "📋"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-bold text-foreground">
                  {selectedItem.name}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {selectedItem.item_id}
                </p>
              </div>
              <div className="flex-none text-right">
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {selectedItem.quantity}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedItem.unit} available
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 py-4">
            {stockMutationError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
                {stockMutationError}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="use-quantity" className="text-sm font-semibold">
                Quantity to use
              </Label>
              <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 rounded-xl p-0"
                  onClick={() =>
                    setUseQuantity(String(Math.max(0, parsedUseQuantity - 1)))
                  }
                  disabled={parsedUseQuantity <= 0}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-5 w-5" aria-hidden="true" />
                </Button>
                <Input
                  id="use-quantity"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={selectedItem?.quantity}
                  value={useQuantity}
                  onChange={(e) => setUseQuantity(e.target.value)}
                  placeholder="0"
                  className="h-12 rounded-xl text-center text-lg font-bold tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 rounded-xl p-0"
                  onClick={() =>
                    setUseQuantity(
                      String(
                        Math.min(
                          selectedItem?.quantity || 0,
                          parsedUseQuantity + 1,
                        ),
                      ),
                    )
                  }
                  disabled={
                    !selectedItem || parsedUseQuantity >= selectedItem.quantity
                  }
                  aria-label="Increase quantity"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              {selectedItem && parsedUseQuantity > 0 && (
                <div
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${
                    invalidUseQuantity
                      ? "border border-destructive/30 bg-destructive/10 text-destructive"
                      : "border border-success/30 bg-success/10 text-success"
                  }`}
                >
                  <span>Remaining stock</span>
                  <span>
                    {remainingQuantity} {selectedItem.unit}
                  </span>
                </div>
              )}
            </div>

            {/* Job Selection */}
            <div>
              <Label htmlFor="use-job">Link to Job (Optional)</Label>
              {loadingJobsPMs ? (
                <div className="text-sm text-muted-foreground py-2">
                  Loading jobs...
                </div>
              ) : (
                <Select
                  value={selectedJobId || undefined}
                  onValueChange={(value) => setSelectedJobId(value || "")}
                >
                  <SelectTrigger id="use-job" className="h-12 rounded-xl">
                    <SelectValue placeholder="Select a job (optional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[45vh]">
                    {userJobs.length > 0 ? (
                      userJobs.map((job) => (
                        <SelectItem key={job.job_id} value={job.job_id}>
                          {job.job_id} -{" "}
                          {job.description?.substring(0, 50) ||
                            "No description"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-jobs" disabled>
                        No jobs available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
              {selectedItem?.last_job_by_user && !selectedJobId && (
                <div className="mt-1 text-xs text-info">
                  Last used: {selectedItem.last_job_by_user.job_id}
                </div>
              )}
            </div>

            {/* PM Selection */}
            <div>
              <Label htmlFor="use-pm">
                Link to Preventive Maintenance (Optional)
              </Label>
              {loadingJobsPMs ? (
                <div className="text-sm text-muted-foreground py-2">
                  Loading PMs...
                </div>
              ) : (
                <Select
                  value={selectedPmId || undefined}
                  onValueChange={(value) => setSelectedPmId(value || "")}
                >
                  <SelectTrigger id="use-pm" className="h-12 rounded-xl">
                    <SelectValue placeholder="Select a PM (optional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[45vh]">
                    {userPMs.length > 0 ? (
                      userPMs.map((pm) => (
                        <SelectItem key={pm.pm_id} value={pm.pm_id}>
                          {pm.pm_id} -{" "}
                          {pm.pmtitle?.substring(0, 50) || "No title"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-pms" disabled>
                        No PMs available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
              {selectedItem?.last_pm_by_user && !selectedPmId && (
                <div className="mt-1 text-xs text-primary">
                  Last used: {selectedItem.last_pm_by_user.pm_id}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
              Note: You can link this inventory usage to a job or PM to track
              what it was used for.
            </div>
          </div>
          <DialogFooter className="!grid grid-cols-2 gap-2 sm:!flex">
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl"
              onClick={() => {
                setShowUseDialog(false);
                setUseQuantity("");
                setSelectedJobId("");
                setSelectedPmId("");
                setSelectedItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUse}
              className="h-12 w-full rounded-xl"
              disabled={stockMutationPending || invalidUseQuantity}
            >
              {stockMutationPending ? "Saving…" : "Use"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {filteredInventory.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="text-center text-sm text-muted-foreground sm:text-left">
                Showing {(page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, totalCount)} of {totalCount} items
              </div>

              <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>

                <span className="text-center text-sm font-bold text-foreground sm:hidden">
                  {page} / {totalPages}
                </span>

                <div className="hidden items-center gap-1 sm:flex">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className="min-w-[2.5rem]"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4 sm:ml-1" aria-hidden="true" />
                </Button>
              </div>

              <div className="flex w-full items-center justify-center gap-2 sm:w-auto">
                <label htmlFor="inventory-page-size" className="text-sm text-muted-foreground">
                  Per page:
                </label>
                <select
                  id="inventory-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

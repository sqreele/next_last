"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/lib/session.client";
import { useUser } from "@/app/lib/stores/mainStore";
import apiClient from "@/app/lib/api-client";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";

import { useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import { buildInventoryListParams, scheduleInventorySearch } from "@/app/lib/inventory-search.mjs";

import { InventoryItem } from "./inventory-page-config";

export function useInventoryPageModel() {
  const { status } = useSession();
  const router = useRouter();
  const t = useT();
  const { selectedPropertyId: selectedProperty } = useUser();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [canManageStock, setCanManageStock] = useState(false);
  const [canConsumeInventory, setCanConsumeInventory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const inventorySearchRef = useRef<HTMLInputElement>(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [hasLoadedInventory, setHasLoadedInventory] = useState(false);
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
  const hasLoadedInventoryRef = useRef(hasLoadedInventory);
  hasLoadedInventoryRef.current = hasLoadedInventory;
  const requestIdRef = useRef(0);
  const selectedPropertyRef = useRef(selectedProperty);
  selectedPropertyRef.current = selectedProperty;

  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setLoading);

  const fetchInventory = useCallback(async (
    signal?: AbortSignal,
    requestId = requestIdRef.current,
  ) => {
    if (!selectedProperty) return;
    const loaderGeneration = recordLoaderShown();
    setLoading(true);
    setError(null);
    try {
      const params = buildInventoryListParams({
        propertyId: selectedProperty,
        page,
        pageSize,
        category: selectedCategory,
        status: selectedStatus,
        room: selectedRoom,
        lowStockOnly,
        job: selectedJobFilter,
        preventiveMaintenance: selectedPmFilter,
        search: debouncedSearchTerm,
      });

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
        setHasLoadedInventory(true);
      }
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED") return;
      console.error("Error fetching inventory:", err);
      if (requestId === requestIdRef.current) {
        setError(err.message || "Failed to load inventory");
        if (!hasLoadedInventoryRef.current) {
          setInventory([]);
          setTotalCount(0);
          setTotalPages(1);
        }
      }
    } finally {
      if (requestId === requestIdRef.current) {
        clearLoadingAfterMinTime(loaderGeneration);
      }
    }
  }, [selectedProperty, page, pageSize, selectedCategory, selectedStatus, selectedRoom, lowStockOnly, selectedJobFilter, selectedPmFilter, debouncedSearchTerm, recordLoaderShown, clearLoadingAfterMinTime]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    setInventory([]);
    setCanManageStock(false);
    setCanConsumeInventory(false);
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
    setDebouncedSearchTerm("");
    setHasLoadedInventory(false);
    setCategoryOptions([]);
    setNewItem((item) => ({ ...item, category: "other" }));
  }, [selectedProperty]);

  useEffect(
    () =>
      scheduleInventorySearch(searchTerm, (nextSearchTerm: string) => {
        setDebouncedSearchTerm(nextSearchTerm);
        setPage(1);
      }),
    [searchTerm],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
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
    debouncedSearchTerm,
    fetchInventory,
  ]);

  useEffect(() => {
    if (status !== "authenticated" || !selectedProperty) return;
    let active = true;
    apiClient.get("/api/v1/inventory/capabilities/", {
      params: { property_id: selectedProperty },
    }).then((response) => {
      if (!active) return;
      setCanManageStock(response.data?.can_manage_inventory_stock === true);
      setCanConsumeInventory(response.data?.can_consume_inventory === true);
    }).catch(() => {
      if (active) {
        setCanManageStock(false);
        setCanConsumeInventory(false);
      }
    });
    return () => { active = false; };
  }, [selectedProperty, status]);

  // Fetch filter options (categories, statuses) from backend
  useEffect(() => {
    const controller = new AbortController();
    const requestedProperty = selectedProperty;
    const fetchInventoryFilterOptions = async () => {
      if (status !== "authenticated" || !requestedProperty) {
        setCategoryOptions([]);
        setNewItem((item) => ({ ...item, category: "" }));
        return;
      }

      try {
        const response = await apiClient.get(
          "/api/v1/inventory/filter_options/",
          {
            params: requestedProperty ? { property_id: requestedProperty } : {},
            signal: controller.signal,
          },
        );
        if (requestedProperty !== selectedPropertyRef.current) return;
        if (response.data) {
          const categories = response.data.categories || [];
          setCategoryOptions(categories);
          setNewItem((item) => ({
            ...item,
            category: categories.some(
              (category: { value: string }) => category.value === "other",
            )
              ? "other"
              : categories[0]?.value || "",
          }));
          setStatusOptions(response.data.statuses || []);
        }
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED") return;
        if (requestedProperty !== selectedPropertyRef.current) return;
        console.error("Error fetching inventory filter options:", err);
        // Fail closed: stale or assumed categories must never become selectable.
        setCategoryOptions([]);
        setNewItem((item) => ({ ...item, category: "" }));
        setStatusOptions([
          { value: "available", label: "Available" },
          { value: "low_stock", label: "Low Stock" },
          { value: "out_of_stock", label: "Out of Stock" },
          { value: "reserved", label: "Reserved" },
          { value: "maintenance", label: "Under Maintenance" },
        ]);
      }
    };

    void fetchInventoryFilterOptions();
    return () => controller.abort();
  }, [status, selectedProperty]);

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

  // No need for client-side filtering - backend handles it via search param
  // Keep filteredInventory for backward compatibility but use inventory directly
  const filteredInventory = inventory;

  const handleRestock = async () => {
    if (!canManageStock || !selectedItem || !restockQuantity || stockMutationPending) return;

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
    if (!canConsumeInventory || !selectedItem || !useQuantity || stockMutationPending) return;

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
    if (!canManageStock || !selectedProperty || !newItem.name.trim() || addPending) return;
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

  const getCategoryLabel = (category: string, fallback?: string) => {
    const categoryKeys: Record<string, DictKey> = {
      tools: "inventory.category.tools", parts: "inventory.category.parts",
      supplies: "inventory.category.supplies", equipment: "inventory.category.equipment",
      consumables: "inventory.category.consumables", safety: "inventory.category.safety",
      safety_equipment: "inventory.category.safety", other: "inventory.category.other",
    };
    return categoryKeys[category] ? t(categoryKeys[category]) : (fallback || category);
  };

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

  return {
    status,
    loading,
    hasLoadedInventory,
    t,
    error,
    fetchInventory,
    selectedProperty,
    totalCount,
    lowStockCount,
    searchTerm,
    selectedCategory,
    selectedStatus,
    selectedRoom,
    lowStockOnly,
    selectedJobFilter,
    selectedPmFilter,
    filteredInventory,
    canManageStock,
    showAddDialog,
    setShowAddDialog,
    setStockMutationError,
    stockMutationError,
    newItem,
    setNewItem,
    addPending,
    categoryOptions,
    getCategoryLabel,
    handleAddItem,
    inventory,
    setLowStockOnly,
    setPage,
    inventorySearchRef,
    setSearchTerm,
    viewMode,
    setViewMode,
    activeFilterCount,
    setShowMobileFilters,
    showMobileFilters,
    setSelectedCategory,
    setSelectedStatus,
    statusOptions,
    setSelectedRoom,
    rooms,
    setSelectedJobFilter,
    jobsForFilter,
    setSelectedPmFilter,
    pmsForFilter,
    setSelectedItem,
    setShowRestockDialog,
    canConsumeInventory,
    setShowUseDialog,
    showRestockDialog,
    selectedItem,
    restockQuantity,
    setRestockQuantity,
    handleRestock,
    stockMutationPending,
    showUseDialog,
    setUseQuantity,
    setSelectedJobId,
    setSelectedPmId,
    parsedUseQuantity,
    useQuantity,
    invalidUseQuantity,
    remainingQuantity,
    loadingJobsPMs,
    selectedJobId,
    userJobs,
    selectedPmId,
    userPMs,
    handleUse,
    totalPages,
    page,
    pageSize,
    setPageSize,
  };
}

export type InventoryPageModel = ReturnType<typeof useInventoryPageModel>;

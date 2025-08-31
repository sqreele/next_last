# 🚀 State Management Migration Guide: Context → Zustand

## 📋 Overview

This guide helps you migrate from the complex nested context providers to a clean, unified Zustand store.

## 🔄 Before vs After

### ❌ **Before: Nested Context Providers**
```tsx
// 6 levels deep - problematic!
<AuthProvider>
  <UserProvider>
    <PropertyProvider>
      <JobProvider>
        <PreventiveMaintenanceProvider>
          <FilterProvider>
            {children}
          </FilterProvider>
        </PreventiveMaintenanceProvider>
      </JobProvider>
    </PropertyProvider>
  </UserProvider>
</AuthProvider>
```

### ✅ **After: Single Zustand Store**
```tsx
// Clean and simple!
<StoreProvider>
  {children}
</StoreProvider>
```

## 🛠️ Migration Steps

### Step 1: Update Layout.tsx

**Replace this:**
```tsx
// Old: Multiple providers
<AuthProvider>
  <UserProvider>
    <PropertyProvider>
      <JobProvider>
        <PreventiveMaintenanceProvider>
          <FilterProvider>
            <main className="flex min-h-screen w-full flex-col">
              {children}
            </main>
          </FilterProvider>
        </PreventiveMaintenanceProvider>
      </JobProvider>
    </PropertyProvider>
  </UserProvider>
  <Toaster />
</AuthProvider>
```

**With this:**
```tsx
// New: Single provider
<StoreProvider>
  <main className="flex min-h-screen w-full flex-col">
    {children}
  </main>
  <Toaster />
</StoreProvider>
```

### Step 2: Update Component Imports

**Old way:**
```tsx
import { useUser } from '@/app/lib/user-context';
import { useProperties } from '@/app/lib/PropertyContext';
import { useJobs } from '@/app/lib/JobContext';
import { usePreventiveMaintenance } from '@/app/lib/PreventiveContext';
import { useFilters } from '@/app/lib/FilterContext';
```

**New way:**
```tsx
import { useUser, useProperties, useJobs, usePreventiveMaintenance, useFilters } from '@/app/lib/stores/mainStore';
```

### Step 3: Update Hook Usage

**Old way:**
```tsx
const { userProfile, selectedProperty, setSelectedProperty } = useUser();
const { properties, loading, error } = useProperties();
```

**New way:**
```tsx
const { userProfile, selectedPropertyId, setSelectedPropertyId } = useUser();
const { properties, propertyLoading, propertyError } = useProperties();
```

## 📚 Hook Mapping

| Old Context | New Hook | Key Changes |
|-------------|----------|-------------|
| `useUser()` | `useUser()` | `selectedProperty` → `selectedPropertyId` |
| `useProperties()` | `useProperties()` | `loading` → `propertyLoading`, `error` → `propertyError` |
| `useJobs()` | `useJobs()` | `loading` → `jobLoading`, `error` → `jobError` |
| `usePreventiveMaintenance()` | `usePreventiveMaintenance()` | `loading` → `maintenanceLoading`, `error` → `maintenanceError` |
| `useFilters()` | `useFilters()` | No changes |

## 🔧 Advanced Usage

### Accessing Multiple Slices
```tsx
// If you need data from multiple slices
const { userProfile } = useUser();
const { properties } = useProperties();
const { jobs } = useJobs();

// Or use the main store directly
const { userProfile, properties, jobs } = useStore();
```

### Computed Values
```tsx
const { getFilteredJobs, getJobsByStatus } = useJobs();

// Use computed values
const pendingJobs = getJobsByStatus('pending');
const filteredJobs = getFilteredJobs();
```

### Persistence
The store automatically persists:
- User profile
- Selected property
- Properties list

**Sensitive data is NOT persisted:**
- Access tokens
- Refresh tokens
- Job data
- Filter state

## 🚨 Breaking Changes

### 1. Property Selection
```tsx
// Old
const { selectedProperty } = useUser();
const { setSelectedProperty } = useUser();

// New
const { selectedPropertyId } = useUser();
const { setSelectedPropertyId } = useUser();
```

### 2. Loading States
```tsx
// Old
const { loading, error } = useProperties();

// New
const { propertyLoading, propertyError } = useProperties();
```

### 3. Context Removal
Remove these files after migration:
- `app/lib/user-context.tsx`
- `app/lib/PropertyContext.tsx`
- `app/lib/JobContext.tsx`
- `app/lib/PreventiveContext.tsx`
- `app/lib/FilterContext.tsx`

## ✅ Benefits of Migration

1. **Performance**: No unnecessary re-renders
2. **Maintainability**: Single source of truth
3. **Developer Experience**: Better TypeScript support
4. **Testing**: Easier to mock and test
5. **Bundle Size**: Smaller bundle (fewer providers)
6. **Debugging**: Zustand DevTools integration

## 🧪 Testing the Migration

### 1. Check Console for Errors
Look for any undefined property errors.

### 2. Verify Data Persistence
- Login/logout should work
- Selected property should persist
- User profile should load

### 3. Test Core Functionality
- Job creation/editing
- Property selection
- Filtering
- Preventive maintenance

## 🆘 Troubleshooting

### Common Issues

**Error: "Cannot read property of undefined"**
- Check if you're using the new hook names
- Verify the component is wrapped in `StoreProvider`

**Data not persisting**
- Check browser storage
- Verify the store is properly initialized

**Performance issues**
- Use selector hooks for specific data
- Avoid accessing the entire store unnecessarily

### Debug Mode
```tsx
// Enable Zustand DevTools in development
const store = useStore();
console.log('Store state:', store);
```

## 🎯 Next Steps

1. **Gradual Migration**: Migrate one component at a time
2. **Remove Old Contexts**: Delete old context files after testing
3. **Optimize**: Use selector hooks for better performance
4. **Add Features**: Leverage Zustand's middleware for new functionality

## 📞 Need Help?

If you encounter issues during migration:
1. Check the console for errors
2. Verify hook usage matches the new API
3. Ensure `StoreProvider` wraps your app
4. Use the debug mode to inspect store state

---

**Happy migrating! 🚀**

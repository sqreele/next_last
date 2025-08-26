# Zustand Migration Guide

This project has been migrated from React Context API to Zustand for state management. This document explains the new architecture and how to use it.

## Overview

Zustand is a lightweight state management library that provides:
- Simple, unopinionated state management
- Built-in TypeScript support
- Automatic persistence to localStorage
- No need for providers or context wrappers
- Better performance than Context API

## Store Architecture

### 1. Auth Store (`useAuthStore`)
Manages user authentication and profile data:
- User profile information
- Selected property
- Loading states
- Error handling
- Automatic persistence

### 2. Property Store (`usePropertyStore`)
Manages property-related state:
- User properties list
- Selected property
- Property validation
- Local storage persistence

### 3. Jobs Store (`useJobsStore`)
Manages job-related state:
- Jobs list
- Loading states
- Error handling
- Last load timestamp
- Job updates

### 4. Preventive Maintenance Store (`usePreventiveMaintenanceStore`)
Manages PM-related state:
- Maintenance items
- Topics and machines
- Statistics and dashboard data
- Filter parameters
- Search functionality

### 5. Filter Store (`useFilterStore`)
Manages global filter state:
- Status filters
- Priority filters
- Time range filters
- Search queries
- Property-specific filters

## Usage

### Basic Store Usage

```typescript
import { useAuthStore, usePropertyStore } from '@/app/lib/stores';

function MyComponent() {
  const { userProfile, selectedProperty, setSelectedProperty } = useAuthStore();
  const { userProperties } = usePropertyStore();
  
  return (
    <div>
      <h1>Welcome, {userProfile?.username}</h1>
      <select 
        value={selectedProperty || ''} 
        onChange={(e) => setSelectedProperty(e.target.value)}
      >
        {userProperties.map(prop => (
          <option key={prop.property_id} value={prop.property_id}>
            {prop.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Comprehensive Hook Usage

For components that need access to multiple stores, use the `useZustandStores` hook:

```typescript
import { useZustandStores } from '@/app/lib/stores';

function DashboardComponent() {
  const {
    // Store states
    auth,
    property,
    jobs,
    pm,
    filter,
    
    // Actions
    updateSelectedProperty,
    refreshJobs,
    refreshPMData,
    
    // Computed values
    hasProperties,
    selectedProperty,
    isLoading,
    hasError,
  } = useZustandStores();

  const handlePropertyChange = (propertyId: string) => {
    updateSelectedProperty(propertyId);
    // This automatically updates all related stores
  };

  return (
    <div>
      {/* Your component JSX */}
    </div>
  );
}
```

## Migration from Context API

### Before (Context API)
```typescript
import { useProperty } from '@/app/lib/PropertyContext';
import { useFilter } from '@/app/lib/FilterContext';

function OldComponent() {
  const { selectedProperty, setSelectedProperty } = useProperty();
  const { status, setStatus } = useFilter();
  // ...
}
```

### After (Zustand)
```typescript
import { useAuthStore, useFilterStore } from '@/app/lib/stores';

function NewComponent() {
  const { selectedProperty, setSelectedProperty } = useAuthStore();
  const { status, setStatus } = useFilterStore();
  // ...
}
```

## Key Benefits

1. **No Provider Wrapping**: Components can use stores directly without context providers
2. **Better Performance**: Zustand uses efficient subscription patterns
3. **Automatic Persistence**: Stores automatically save to localStorage
4. **TypeScript Support**: Full type safety with minimal setup
5. **DevTools**: Built-in Redux DevTools support
6. **Middleware**: Easy to add persistence, logging, etc.

## Store Methods

### Common Store Methods
- `set*`: Update specific state values
- `clear*`: Reset store to initial state
- `reset*`: Reset specific values to defaults

### Persistence
Stores automatically persist to localStorage with the following keys:
- `auth-storage`: User preferences and selected property
- `pm-storage`: Filter parameters and selected maintenance
- `filter-storage`: Global filter state

## Error Handling

Stores include built-in error handling:
```typescript
const { error, setError, clearError } = usePreventiveMaintenanceStore();

// Set error
setError('Something went wrong');

// Clear error
clearError();

// Check for errors
if (error) {
  console.error('Store error:', error);
}
```

## Loading States

Stores manage loading states automatically:
```typescript
const { isLoading, setLoading } = useJobsStore();

// Show loading indicator
if (isLoading) {
  return <div>Loading...</div>;
}
```

## Best Practices

1. **Use Specific Stores**: Import only the stores you need
2. **Leverage Computed Values**: Use store getters for derived state
3. **Batch Updates**: Multiple state changes in one action
4. **Error Boundaries**: Handle store errors gracefully
5. **Persistence**: Let stores handle localStorage automatically

## Example Components

See `app/lib/examples/ZustandUsageExample.tsx` for a complete example of using all stores together.

## Troubleshooting

### Common Issues

1. **Store Not Updating**: Ensure you're calling the correct setter method
2. **Persistence Issues**: Check localStorage for corrupted data
3. **Type Errors**: Verify store interfaces match your data
4. **Performance**: Use specific store selectors for large state objects

### Debug Mode

Enable debug mode to see detailed logging:
```typescript
localStorage.setItem('debug_mode', 'true');
```

## Future Enhancements

- Add middleware for API caching
- Implement optimistic updates
- Add real-time synchronization
- Create store composition patterns
- Add performance monitoring

## Support

For questions about the Zustand implementation, refer to:
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Example Component](./examples/ZustandUsageExample.tsx)
- [Store Definitions](./stores/)

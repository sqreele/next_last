"use client";

import React from 'react';
import { useZustandStores } from '@/app/lib/stores';

/**
 * Example component showing how to use the new Zustand stores
 * This replaces the old context-based approach
 */
export function ZustandUsageExample() {
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
    clearAllStores,
    
    // Computed values
    hasProperties,
    selectedProperty,
    userProfile,
    isLoading,
    hasError,
  } = useZustandStores();

  const handlePropertyChange = (propertyId: string) => {
    updateSelectedProperty(propertyId);
  };

  const handleRefreshData = () => {
    refreshPMData();
    refreshJobs();
  };

  const handleClearFilters = () => {
    filter.resetFilters();
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Zustand Stores Example</h2>
      
      {/* User Profile Section */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">User Profile</h3>
        {userProfile ? (
          <div>
            <p>Username: {userProfile.username}</p>
            <p>Position: {userProfile.positions}</p>
            <p>Properties: {userProfile.properties.length}</p>
          </div>
        ) : (
          <p>No user profile loaded</p>
        )}
      </div>

      {/* Property Selection */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">Property Selection</h3>
        <div className="space-y-2">
          {property.userProperties.map((prop) => (
            <button
              key={prop.property_id}
              onClick={() => handlePropertyChange(prop.property_id)}
              className={`px-3 py-1 rounded ${
                selectedProperty === prop.property_id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {prop.name}
            </button>
          ))}
        </div>
        <p className="mt-2">Selected: {selectedProperty || 'None'}</p>
      </div>

      {/* Jobs Section */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">Jobs</h3>
        <div className="space-y-2">
          <p>Total Jobs: {jobs.jobs.length}</p>
          <p>Last Load: {jobs.lastLoadTime ? new Date(jobs.lastLoadTime).toLocaleString() : 'Never'}</p>
          <button
            onClick={() => refreshJobs()}
            disabled={jobs.isLoading}
            className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50"
          >
            {jobs.isLoading ? 'Loading...' : 'Refresh Jobs'}
          </button>
        </div>
      </div>

      {/* PM Section */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">Preventive Maintenance</h3>
        <div className="space-y-2">
          <p>Total Items: {pm.totalCount}</p>
          <p>Topics: {pm.topics.length}</p>
          <p>Machines: {pm.machines.length}</p>
          <button
            onClick={handleRefreshData}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh PM Data'}
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">Filters</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-sm">Status:</label>
            <select
              value={filter.status}
              onChange={(e) => filter.setStatus(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Search:</label>
            <input
              type="text"
              value={filter.search}
              onChange={(e) => filter.setSearch(e.target.value)}
              placeholder="Search..."
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <button
            onClick={handleClearFilters}
            className="px-3 py-1 bg-red-500 text-white rounded"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error Display */}
      {hasError && (
        <div className="border border-red-300 bg-red-50 rounded p-3">
          <h3 className="font-semibold text-red-800 mb-2">Errors</h3>
          {pm.error && <p className="text-red-700">PM: {pm.error}</p>}
          {jobs.error && <p className="text-red-700">Jobs: {jobs.error}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="border rounded p-3">
        <h3 className="font-semibold mb-2">Actions</h3>
        <div className="space-x-2">
          <button
            onClick={() => clearAllStores()}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            Clear All Stores
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Date utility functions for consistent formatting between server and client
 * This prevents hydration mismatches caused by different locales/timezones
 */

/**
 * Format a date string consistently for display
 * Uses a fixed format that doesn't depend on locale
 */
export function formatDate(dateString: string | Date): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    // Use a consistent format: YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch {
    return 'N/A';
  }
}

/**
 * Format a date string with time consistently
 * Uses a fixed format that doesn't depend on locale
 */
export function formatDateTime(dateString: string | Date): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    // Use a consistent format: YYYY-MM-DD HH:MM:SS
    const datePart = date.toISOString().split('T')[0];
    const timePart = date.toTimeString().split(' ')[0];
    return `${datePart} ${timePart}`;
  } catch {
    return 'N/A';
  }
}

/**
 * Get current date in consistent format
 * This prevents hydration mismatches from dynamic date generation
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current date and time in consistent format
 */
export function getCurrentDateTime(): string {
  return new Date().toISOString();
}

/**
 * Check if a date is in the past
 */
export function isDateInPast(dateString: string | Date): boolean {
  if (!dateString) return false;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    return date < now;
  } catch {
    return false;
  }
}

/**
 * Check if a date is overdue (more than 7 days in the past)
 */
export function isDateOverdue(dateString: string | Date): boolean {
  if (!dateString) return false;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return date < oneWeekAgo;
  } catch {
    return false;
  }
}

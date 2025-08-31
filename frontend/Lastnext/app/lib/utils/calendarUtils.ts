/**
 * Calendar utility functions for date ranges and business calculations
 */

export class CalendarUtils {
  /**
   * Get current year
   */
  static getCurrentYear(): number {
    return new Date().getFullYear();
  }

  /**
   * Get current month (0-11)
   */
  static getCurrentMonth(): number {
    return new Date().getMonth();
  }

  /**
   * Get current week number
   */
  static getCurrentWeek(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  /**
   * Get this week's date range
   */
  static getThisWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get last week's date range
   */
  static getLastWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - 7);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get this month's date range
   */
  static getThisMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get last month's date range
   */
  static getLastMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get this quarter's date range
   */
  static getThisQuarterRange(): { start: Date; end: Date } {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), quarter * 3, 1);
    const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get last quarter's date range
   */
  static getLastQuarterRange(): { start: Date; end: Date } {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
    const end = new Date(now.getFullYear(), quarter * 3, 0);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get this year's date range
   */
  static getThisYearRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get last year's date range
   */
  static getLastYearRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }

  /**
   * Get business days in a date range (excluding weekends)
   */
  static getBusinessDaysInRange(range: { start: Date; end: Date }): number {
    let businessDays = 0;
    const current = new Date(range.start);
    
    while (current <= range.end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        businessDays++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return businessDays;
  }

  /**
   * Format a date with different formats
   */
  static formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'iso'): string {
    switch (format) {
      case 'short':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'long':
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      case 'iso':
      default:
        return date.toISOString().split('T')[0];
    }
  }
}

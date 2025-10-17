'use client';
import { Font } from '@react-pdf/renderer';

// Font registration state
let fontsRegistered = false;
let registrationError: Error | null = null;

/**
 * Centralized font registration for PDF generation
 * Handles Sarabun font registration with fallbacks for missing italic variants
 */
export const registerPdfFonts = (): boolean => {
  if (fontsRegistered) return true;
  if (registrationError) {
    console.warn('Font registration previously failed, using fallback');
    return false;
  }

  try {
    // Register Sarabun font with all available weights and styles
    Font.register({
      family: 'Sarabun',
      fonts: [
        { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'normal' },
        { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'normal' },
        // Note: Sarabun-Italic.ttf is not available, so we'll use Regular for italic
        { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'italic' },
        { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
    
    console.log('✅ Sarabun font registered successfully with italic fallback');
    fontsRegistered = true;
    return true;
  } catch (error) {
    console.warn('⚠️ Failed to register Sarabun font with primary path:', error);
    
    // Try alternative paths
    try {
      Font.register({
        family: 'Sarabun',
        fonts: [
          { src: './fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'normal' },
          { src: './fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'normal' },
          { src: './fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'italic' },
          { src: './fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'italic' },
        ],
      });
      
      console.log('✅ Sarabun font registered successfully with alternative path');
      fontsRegistered = true;
      return true;
    } catch (altError) {
      console.warn('⚠️ Alternative path also failed:', altError);
    }
    
    // Register fallback fonts
    try {
      Font.register({
        family: 'Helvetica',
        src: '', // Use built-in Helvetica
      });
      console.log('✅ Fallback Helvetica font registered successfully');
      registrationError = error as Error;
      return false;
    } catch (fallbackError) {
      console.error('❌ Failed to register fallback font:', fallbackError);
      registrationError = error as Error;
      return false;
    }
  }
};

/**
 * Get the appropriate font family based on registration status
 */
export const getPdfFontFamily = (): string => {
  return fontsRegistered ? 'Sarabun' : 'Helvetica, Arial';
};

/**
 * Check if fonts are registered
 */
export const arePdfFontsRegistered = (): boolean => {
  return fontsRegistered;
};

/**
 * Reset font registration state (useful for testing)
 */
export const resetPdfFontRegistration = (): void => {
  fontsRegistered = false;
  registrationError = null;
};

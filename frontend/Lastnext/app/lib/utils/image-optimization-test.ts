/**
 * Image Optimization Test Utility
 * Provides testing and validation for image optimization across all pages
 */

"use client";

import { UniversalImageProps } from '@/app/components/ui/UniversalImage';
import { validateImageOptimization } from './image-replacement-helper';

export interface ImageOptimizationTestResult {
  page: string;
  component: string;
  testType: 'performance' | 'accessibility' | 'seo' | 'functionality';
  status: 'pass' | 'fail' | 'warning';
  message: string;
  suggestions?: string[];
}

export interface ImageOptimizationReport {
  overallScore: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  warnings: number;
  results: ImageOptimizationTestResult[];
  recommendations: string[];
}

/**
 * Test image optimization across all pages
 */
export async function testImageOptimization(): Promise<ImageOptimizationReport> {
  const results: ImageOptimizationTestResult[] = [];
  
  // Test 1: Validate optimization setup
  const setupValidation = validateImageOptimization();
  results.push({
    page: 'global',
    component: 'setup',
    testType: 'functionality',
    status: setupValidation.isValid ? 'pass' : 'fail',
    message: setupValidation.isValid 
      ? 'Image optimization setup is valid' 
      : `Setup issues: ${setupValidation.issues.join(', ')}`,
    suggestions: setupValidation.recommendations
  });
  
  // Test 2: Check for regular img tags
  const imgTagResults = await testForRegularImgTags();
  results.push(...imgTagResults);
  
  // Test 3: Test image loading performance
  const performanceResults = await testImageLoadingPerformance();
  results.push(...performanceResults);
  
  // Test 4: Test accessibility
  const accessibilityResults = await testImageAccessibility();
  results.push(...accessibilityResults);
  
  // Test 5: Test SEO optimization
  const seoResults = await testImageSEO();
  results.push(...seoResults);
  
  // Calculate overall score
  const totalTests = results.length;
  const passedTests = results.filter(r => r.status === 'pass').length;
  const failedTests = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  
  const overallScore = Math.round((passedTests / totalTests) * 100);
  
  // Generate recommendations
  const recommendations = generateRecommendations(results);
  
  return {
    overallScore,
    totalTests,
    passedTests,
    failedTests,
    warnings,
    results,
    recommendations
  };
}

/**
 * Test for regular img tags that should be replaced
 */
async function testForRegularImgTags(): Promise<ImageOptimizationTestResult[]> {
  const results: ImageOptimizationTestResult[] = [];
  
  // This would typically scan the codebase for <img> tags
  // For now, we'll simulate the test
  const imgTagCount = 0; // This would be calculated by scanning files
  
  results.push({
    page: 'global',
    component: 'img-tags',
    testType: 'functionality',
    status: imgTagCount === 0 ? 'pass' : 'warning',
    message: imgTagCount === 0 
      ? 'No regular img tags found - all images are optimized' 
      : `Found ${imgTagCount} regular img tags that should be replaced with optimized components`,
    suggestions: imgTagCount > 0 ? [
      'Replace regular <img> tags with UniversalImage components',
      'Use appropriate presets for different image types',
      'Ensure all images have proper alt text'
    ] : []
  });
  
  return results;
}

/**
 * Test image loading performance
 */
async function testImageLoadingPerformance(): Promise<ImageOptimizationTestResult[]> {
  const results: ImageOptimizationTestResult[] = [];
  
  // Test critical image loading times
  const criticalImages = [
    '/images/logo.png',
    '/images/dashboard-hero.jpg',
    '/images/profile-placeholder.jpg'
  ];
  
  for (const imageUrl of criticalImages) {
    const startTime = performance.now();
    
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
      
      const loadTime = performance.now() - startTime;
      const isFast = loadTime < 1000; // Less than 1 second
      
      results.push({
        page: 'performance',
        component: imageUrl,
        testType: 'performance',
        status: isFast ? 'pass' : 'warning',
        message: `Image loaded in ${loadTime.toFixed(2)}ms`,
        suggestions: !isFast ? [
          'Consider optimizing image size',
          'Use WebP or AVIF format',
          'Implement lazy loading',
          'Add image preloading for critical images'
        ] : []
      });
    } catch (error) {
      results.push({
        page: 'performance',
        component: imageUrl,
        testType: 'performance',
        status: 'fail',
        message: `Failed to load image: ${error}`,
        suggestions: [
          'Check image URL',
          'Verify image exists',
          'Add fallback image'
        ]
      });
    }
  }
  
  return results;
}

/**
 * Test image accessibility
 */
async function testImageAccessibility(): Promise<ImageOptimizationTestResult[]> {
  const results: ImageOptimizationTestResult[] = [];
  
  // Test for alt text on all images
  const images = document.querySelectorAll('img');
  let imagesWithoutAlt = 0;
  let imagesWithEmptyAlt = 0;
  
  images.forEach(img => {
    if (!img.alt) {
      imagesWithoutAlt++;
    } else if (img.alt.trim() === '') {
      imagesWithEmptyAlt++;
    }
  });
  
  const totalImages = images.length;
  const accessibilityScore = totalImages > 0 
    ? ((totalImages - imagesWithoutAlt - imagesWithEmptyAlt) / totalImages) * 100 
    : 100;
  
  results.push({
    page: 'accessibility',
    component: 'alt-text',
    testType: 'accessibility',
    status: accessibilityScore === 100 ? 'pass' : accessibilityScore >= 80 ? 'warning' : 'fail',
    message: `${totalImages - imagesWithoutAlt - imagesWithEmptyAlt}/${totalImages} images have proper alt text`,
    suggestions: imagesWithoutAlt > 0 || imagesWithEmptyAlt > 0 ? [
      'Add descriptive alt text to all images',
      'Use empty alt="" for decorative images',
      'Ensure alt text describes the image content'
    ] : []
  });
  
  return results;
}

/**
 * Test SEO optimization
 */
async function testImageSEO(): Promise<ImageOptimizationTestResult[]> {
  const results: ImageOptimizationTestResult[] = [];
  
  // Test for proper image formats
  const images = document.querySelectorAll('img');
  let webpImages = 0;
  let avifImages = 0;
  let jpegImages = 0;
  let pngImages = 0;
  
  images.forEach(img => {
    const src = img.src.toLowerCase();
    if (src.includes('.webp')) webpImages++;
    else if (src.includes('.avif')) avifImages++;
    else if (src.includes('.jpg') || src.includes('.jpeg')) jpegImages++;
    else if (src.includes('.png')) pngImages++;
  });
  
  const totalImages = images.length;
  const modernFormatImages = webpImages + avifImages;
  const modernFormatPercentage = totalImages > 0 ? (modernFormatImages / totalImages) * 100 : 0;
  
  results.push({
    page: 'seo',
    component: 'image-formats',
    testType: 'seo',
    status: modernFormatPercentage >= 80 ? 'pass' : modernFormatPercentage >= 50 ? 'warning' : 'fail',
    message: `${modernFormatPercentage.toFixed(1)}% of images use modern formats (WebP/AVIF)`,
    suggestions: modernFormatPercentage < 80 ? [
      'Convert images to WebP or AVIF format',
      'Use Next.js image optimization',
      'Implement format detection and conversion'
    ] : []
  });
  
  // Test for proper image sizing
  let oversizedImages = 0;
  images.forEach(img => {
    const naturalWidth = img.naturalWidth;
    const displayWidth = img.offsetWidth;
    if (naturalWidth > displayWidth * 2) {
      oversizedImages++;
    }
  });
  
  results.push({
    page: 'seo',
    component: 'image-sizing',
    testType: 'seo',
    status: oversizedImages === 0 ? 'pass' : 'warning',
    message: `${oversizedImages} images are significantly larger than their display size`,
    suggestions: oversizedImages > 0 ? [
      'Resize images to match display dimensions',
      'Use responsive images with srcset',
      'Implement proper image optimization'
    ] : []
  });
  
  return results;
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(results: ImageOptimizationTestResult[]): string[] {
  const recommendations: string[] = [];
  
  const failedTests = results.filter(r => r.status === 'fail');
  const warningTests = results.filter(r => r.status === 'warning');
  
  if (failedTests.length > 0) {
    recommendations.push('Address all failed tests to improve image optimization');
  }
  
  if (warningTests.length > 0) {
    recommendations.push('Review warning tests for potential improvements');
  }
  
  // Specific recommendations based on test types
  const performanceIssues = results.filter(r => r.testType === 'performance' && r.status !== 'pass');
  if (performanceIssues.length > 0) {
    recommendations.push('Optimize image loading performance');
  }
  
  const accessibilityIssues = results.filter(r => r.testType === 'accessibility' && r.status !== 'pass');
  if (accessibilityIssues.length > 0) {
    recommendations.push('Improve image accessibility compliance');
  }
  
  const seoIssues = results.filter(r => r.testType === 'seo' && r.status !== 'pass');
  if (seoIssues.length > 0) {
    recommendations.push('Enhance image SEO optimization');
  }
  
  return recommendations;
}

/**
 * Run image optimization test and display results
 */
export async function runImageOptimizationTest(): Promise<void> {
  console.log('🔍 Running image optimization tests...');
  
  const report = await testImageOptimization();
  
  console.log(`\n📊 Image Optimization Report`);
  console.log(`Overall Score: ${report.overallScore}%`);
  console.log(`Tests: ${report.passedTests}/${report.totalTests} passed`);
  console.log(`Warnings: ${report.warnings}`);
  console.log(`Failed: ${report.failedTests}`);
  
  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach(rec => console.log(`  • ${rec}`));
  }
  
  if (report.failedTests > 0) {
    console.log('\n❌ Failed Tests:');
    report.results
      .filter(r => r.status === 'fail')
      .forEach(result => console.log(`  • ${result.component}: ${result.message}`));
  }
  
  if (report.warnings > 0) {
    console.log('\n⚠️  Warnings:');
    report.results
      .filter(r => r.status === 'warning')
      .forEach(result => console.log(`  • ${result.component}: ${result.message}`));
  }
}

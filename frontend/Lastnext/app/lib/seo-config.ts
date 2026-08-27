// Centralized SEO Configuration for HotelCare Pro
// Use this for consistent branding across all pages

export const seoConfig = {
  siteName: 'StayMaint',
  siteUrl: 'https://staymaint.com',
  defaultTitle: 'StayMaint - Smart Hotel Maintenance and Engineering Management Software',
  titleTemplate: '%s | StayMaint',
  defaultDescription: 'Manage work orders, preventive maintenance, assets, rooms, technicians and engineering reports in one StayMaint platform.',
  defaultKeywords: [
    'StayMaint',
    'hotel engineering',
    'hotel maintenance',
    'property maintenance',
    'hospitality management',
    'facility management',
    'job management',
    'task tracking',
    'hotel operations',
    'maintenance dashboard',
    'preventive maintenance',
    'equipment management',
    'hotel facilities',
  ],
  author: {
    name: 'StayMaint',
    url: 'https://staymaint.com',
  },
  twitter: {
    handle: '@StayMaint',
    cardType: 'summary_large_image' as const,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://staymaint.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'StayMaint - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
};

// Page-specific metadata generators
export const pageMetadata = {
  dashboard: {
    title: 'Dashboard',
    description: 'StayMaint Dashboard - View and manage all your hotel maintenance jobs, equipment status, and facility operations in one place.',
    keywords: ['dashboard', 'hotel management', 'maintenance overview', 'job tracking', 'StayMaint'],
  },
  myJobs: {
    title: 'My Jobs',
    description: 'View and manage your assigned hotel maintenance jobs with StayMaint. Track progress, update status, and complete tasks efficiently.',
    keywords: ['my jobs', 'assigned tasks', 'maintenance jobs', 'job management', 'StayMaint'],
  },
  createJob: {
    title: 'Create Job',
    description: 'Create a new hotel maintenance job effortlessly with StayMaint. Assign tasks, set priorities, and upload images with our intuitive form.',
    keywords: ['create job', 'new maintenance task', 'job creation', 'StayMaint'],
  },
  preventiveMaintenance: {
    title: 'Preventive Maintenance',
    description: 'Schedule and manage preventive maintenance tasks for your hotel equipment with StayMaint. Reduce downtime and extend equipment life.',
    keywords: ['preventive maintenance', 'scheduled maintenance', 'equipment care', 'PM schedule', 'StayMaint'],
  },
  machines: {
    title: 'Equipment & Machines',
    description: 'Manage all hotel equipment and machines with StayMaint. Track maintenance history, schedules, and equipment status.',
    keywords: ['equipment', 'machines', 'hotel equipment', 'equipment management', 'StayMaint'],
  },
  rooms: {
    title: 'Rooms Management',
    description: 'Manage hotel rooms and their maintenance needs with StayMaint. Track room status, issues, and maintenance history.',
    keywords: ['rooms', 'room management', 'hotel rooms', 'room maintenance', 'StayMaint'],
  },
  roomsByTopic: {
    title: 'Rooms by Topic',
    description: 'View hotel rooms organized by maintenance topics with StayMaint. Easily identify and address common issues across rooms.',
    keywords: ['rooms by topic', 'maintenance topics', 'room issues', 'StayMaint'],
  },
  inventory: {
    title: 'Inventory',
    description: 'Manage hotel maintenance inventory and spare parts with StayMaint. Track stock levels, orders, and usage.',
    keywords: ['inventory', 'spare parts', 'stock management', 'maintenance supplies', 'StayMaint'],
  },
  reports: {
    title: 'Jobs Report',
    description: 'Generate and view hotel maintenance reports with StayMaint. Analyze performance, trends, and operational efficiency.',
    keywords: ['reports', 'analytics', 'maintenance reports', 'performance tracking', 'StayMaint'],
  },
  profile: {
    title: 'Profile',
    description: 'Manage your StayMaint profile settings, preferences, and account information.',
    keywords: ['profile', 'account settings', 'user preferences', 'StayMaint'],
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to StayMaint - Your professional hotel engineering and maintenance management platform.',
    keywords: ['login', 'sign in', 'StayMaint access', 'hotel management'],
  },
  register: {
    title: 'Create Account',
    description: 'Create your StayMaint account and start managing your hotel engineering and maintenance operations.',
    keywords: ['register', 'sign up', 'create account', 'StayMaint'],
  },
};

// Helper function to generate metadata for a page
export function generatePageMetadata(pageKey: keyof typeof pageMetadata) {
  const page = pageMetadata[pageKey];
  return {
    title: page.title,
    description: page.description,
    keywords: [...page.keywords, ...seoConfig.defaultKeywords.slice(0, 5)],
    openGraph: {
      title: `${page.title} | ${seoConfig.siteName}`,
      description: page.description,
      url: seoConfig.siteUrl,
      siteName: seoConfig.siteName,
      type: 'website',
      locale: 'en_US',
      images: seoConfig.openGraph.images,
    },
    twitter: {
      card: seoConfig.twitter.cardType,
      title: `${page.title} | ${seoConfig.siteName}`,
      description: page.description,
      creator: seoConfig.twitter.handle,
    },
  };
}

// Centralized SEO Configuration for HotelEngPro
// Use this for consistent branding across all pages

export const seoConfig = {
  siteName: 'HotelEngPro',
  siteUrl: 'https://pcms.live',
  defaultTitle: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
  titleTemplate: '%s | HotelEngPro',
  defaultDescription: 'HotelEngPro - Professional hotel engineering and maintenance management platform. Streamline property maintenance, track jobs, and manage tasks efficiently for hotels and hospitality.',
  defaultKeywords: [
    'HotelEngPro',
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
    name: 'HotelEngPro',
    url: 'https://pcms.live',
  },
  twitter: {
    handle: '@HotelEngPro',
    cardType: 'summary_large_image' as const,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://pcms.live/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelEngPro - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
};

// Page-specific metadata generators
export const pageMetadata = {
  dashboard: {
    title: 'Dashboard',
    description: 'HotelEngPro Dashboard - View and manage all your hotel maintenance jobs, equipment status, and facility operations in one place.',
    keywords: ['dashboard', 'hotel management', 'maintenance overview', 'job tracking', 'HotelEngPro'],
  },
  myJobs: {
    title: 'My Jobs',
    description: 'View and manage your assigned hotel maintenance jobs with HotelEngPro. Track progress, update status, and complete tasks efficiently.',
    keywords: ['my jobs', 'assigned tasks', 'maintenance jobs', 'job management', 'HotelEngPro'],
  },
  createJob: {
    title: 'Create Job',
    description: 'Create a new hotel maintenance job effortlessly with HotelEngPro. Assign tasks, set priorities, and upload images with our intuitive form.',
    keywords: ['create job', 'new maintenance task', 'job creation', 'HotelEngPro'],
  },
  preventiveMaintenance: {
    title: 'Preventive Maintenance',
    description: 'Schedule and manage preventive maintenance tasks for your hotel equipment with HotelEngPro. Reduce downtime and extend equipment life.',
    keywords: ['preventive maintenance', 'scheduled maintenance', 'equipment care', 'PM schedule', 'HotelEngPro'],
  },
  machines: {
    title: 'Equipment & Machines',
    description: 'Manage all hotel equipment and machines with HotelEngPro. Track maintenance history, schedules, and equipment status.',
    keywords: ['equipment', 'machines', 'hotel equipment', 'equipment management', 'HotelEngPro'],
  },
  rooms: {
    title: 'Rooms Management',
    description: 'Manage hotel rooms and their maintenance needs with HotelEngPro. Track room status, issues, and maintenance history.',
    keywords: ['rooms', 'room management', 'hotel rooms', 'room maintenance', 'HotelEngPro'],
  },
  roomsByTopic: {
    title: 'Rooms by Topic',
    description: 'View hotel rooms organized by maintenance topics with HotelEngPro. Easily identify and address common issues across rooms.',
    keywords: ['rooms by topic', 'maintenance topics', 'room issues', 'HotelEngPro'],
  },
  inventory: {
    title: 'Inventory',
    description: 'Manage hotel maintenance inventory and spare parts with HotelEngPro. Track stock levels, orders, and usage.',
    keywords: ['inventory', 'spare parts', 'stock management', 'maintenance supplies', 'HotelEngPro'],
  },
  reports: {
    title: 'Jobs Report',
    description: 'Generate and view hotel maintenance reports with HotelEngPro. Analyze performance, trends, and operational efficiency.',
    keywords: ['reports', 'analytics', 'maintenance reports', 'performance tracking', 'HotelEngPro'],
  },
  profile: {
    title: 'Profile',
    description: 'Manage your HotelEngPro profile settings, preferences, and account information.',
    keywords: ['profile', 'account settings', 'user preferences', 'HotelEngPro'],
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to HotelEngPro - Your professional hotel engineering and maintenance management platform.',
    keywords: ['login', 'sign in', 'HotelEngPro access', 'hotel management'],
  },
  register: {
    title: 'Create Account',
    description: 'Create your HotelEngPro account and start managing your hotel engineering and maintenance operations.',
    keywords: ['register', 'sign up', 'create account', 'HotelEngPro'],
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


// Centralized SEO Configuration for HotelCarePro
// Use this for consistent branding across all pages

export const seoConfig = {
  siteName: 'HotelCarePro',
  siteUrl: 'https://hotelcarepro.com',
  defaultTitle: 'HotelCarePro - Hotel Engineering & Maintenance Dashboard',
  titleTemplate: '%s | HotelCarePro',
  defaultDescription: 'HotelCarePro - Professional hotel engineering and maintenance management platform. Streamline property maintenance, track jobs, and manage tasks efficiently for hotels and hospitality.',
  defaultKeywords: [
    'HotelCarePro',
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
    name: 'HotelCarePro',
    url: 'https://hotelcarepro.com',
  },
  twitter: {
    handle: '@HotelCarePro',
    cardType: 'summary_large_image' as const,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://hotelcarepro.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelCarePro - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
};

// Page-specific metadata generators
export const pageMetadata = {
  dashboard: {
    title: 'Dashboard',
    description: 'HotelCarePro Dashboard - View and manage all your hotel maintenance jobs, equipment status, and facility operations in one place.',
    keywords: ['dashboard', 'hotel management', 'maintenance overview', 'job tracking', 'HotelCarePro'],
  },
  myJobs: {
    title: 'My Jobs',
    description: 'View and manage your assigned hotel maintenance jobs with HotelCarePro. Track progress, update status, and complete tasks efficiently.',
    keywords: ['my jobs', 'assigned tasks', 'maintenance jobs', 'job management', 'HotelCarePro'],
  },
  createJob: {
    title: 'Create Job',
    description: 'Create a new hotel maintenance job effortlessly with HotelCarePro. Assign tasks, set priorities, and upload images with our intuitive form.',
    keywords: ['create job', 'new maintenance task', 'job creation', 'HotelCarePro'],
  },
  preventiveMaintenance: {
    title: 'Preventive Maintenance',
    description: 'Schedule and manage preventive maintenance tasks for your hotel equipment with HotelCarePro. Reduce downtime and extend equipment life.',
    keywords: ['preventive maintenance', 'scheduled maintenance', 'equipment care', 'PM schedule', 'HotelCarePro'],
  },
  machines: {
    title: 'Equipment & Machines',
    description: 'Manage all hotel equipment and machines with HotelCarePro. Track maintenance history, schedules, and equipment status.',
    keywords: ['equipment', 'machines', 'hotel equipment', 'equipment management', 'HotelCarePro'],
  },
  rooms: {
    title: 'Rooms Management',
    description: 'Manage hotel rooms and their maintenance needs with HotelCarePro. Track room status, issues, and maintenance history.',
    keywords: ['rooms', 'room management', 'hotel rooms', 'room maintenance', 'HotelCarePro'],
  },
  roomsByTopic: {
    title: 'Rooms by Topic',
    description: 'View hotel rooms organized by maintenance topics with HotelCarePro. Easily identify and address common issues across rooms.',
    keywords: ['rooms by topic', 'maintenance topics', 'room issues', 'HotelCarePro'],
  },
  inventory: {
    title: 'Inventory',
    description: 'Manage hotel maintenance inventory and spare parts with HotelCarePro. Track stock levels, orders, and usage.',
    keywords: ['inventory', 'spare parts', 'stock management', 'maintenance supplies', 'HotelCarePro'],
  },
  reports: {
    title: 'Jobs Report',
    description: 'Generate and view hotel maintenance reports with HotelCarePro. Analyze performance, trends, and operational efficiency.',
    keywords: ['reports', 'analytics', 'maintenance reports', 'performance tracking', 'HotelCarePro'],
  },
  profile: {
    title: 'Profile',
    description: 'Manage your HotelCarePro profile settings, preferences, and account information.',
    keywords: ['profile', 'account settings', 'user preferences', 'HotelCarePro'],
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to HotelCarePro - Your professional hotel engineering and maintenance management platform.',
    keywords: ['login', 'sign in', 'HotelCarePro access', 'hotel management'],
  },
  register: {
    title: 'Create Account',
    description: 'Create your HotelCarePro account and start managing your hotel engineering and maintenance operations.',
    keywords: ['register', 'sign up', 'create account', 'HotelCarePro'],
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


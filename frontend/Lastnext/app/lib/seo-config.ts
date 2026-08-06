// Centralized SEO Configuration for HotelCare Pro
// Use this for consistent branding across all pages

export const seoConfig = {
  siteName: 'HotelCare Pro',
  siteUrl: 'https://hotelcarepro.com',
  defaultTitle: 'HotelCare Pro - Smart Hotel Maintenance and Engineering Management Software',
  titleTemplate: '%s | HotelCare Pro',
  defaultDescription: 'Manage work orders, preventive maintenance, assets, rooms, technicians and engineering reports in one HotelCare Pro platform.',
  defaultKeywords: [
    'HotelCare Pro',
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
    name: 'HotelCare Pro',
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
        alt: 'HotelCare Pro - Hotel Engineering & Maintenance Dashboard',
      },
    ],
  },
};

// Page-specific metadata generators
export const pageMetadata = {
  dashboard: {
    title: 'Dashboard',
    description: 'HotelCare Pro Dashboard - View and manage all your hotel maintenance jobs, equipment status, and facility operations in one place.',
    keywords: ['dashboard', 'hotel management', 'maintenance overview', 'job tracking', 'HotelCare Pro'],
  },
  myJobs: {
    title: 'My Jobs',
    description: 'View and manage your assigned hotel maintenance jobs with HotelCare Pro. Track progress, update status, and complete tasks efficiently.',
    keywords: ['my jobs', 'assigned tasks', 'maintenance jobs', 'job management', 'HotelCare Pro'],
  },
  createJob: {
    title: 'Create Job',
    description: 'Create a new hotel maintenance job effortlessly with HotelCare Pro. Assign tasks, set priorities, and upload images with our intuitive form.',
    keywords: ['create job', 'new maintenance task', 'job creation', 'HotelCare Pro'],
  },
  preventiveMaintenance: {
    title: 'Preventive Maintenance',
    description: 'Schedule and manage preventive maintenance tasks for your hotel equipment with HotelCare Pro. Reduce downtime and extend equipment life.',
    keywords: ['preventive maintenance', 'scheduled maintenance', 'equipment care', 'PM schedule', 'HotelCare Pro'],
  },
  machines: {
    title: 'Equipment & Machines',
    description: 'Manage all hotel equipment and machines with HotelCare Pro. Track maintenance history, schedules, and equipment status.',
    keywords: ['equipment', 'machines', 'hotel equipment', 'equipment management', 'HotelCare Pro'],
  },
  rooms: {
    title: 'Rooms Management',
    description: 'Manage hotel rooms and their maintenance needs with HotelCare Pro. Track room status, issues, and maintenance history.',
    keywords: ['rooms', 'room management', 'hotel rooms', 'room maintenance', 'HotelCare Pro'],
  },
  roomsByTopic: {
    title: 'Rooms by Topic',
    description: 'View hotel rooms organized by maintenance topics with HotelCare Pro. Easily identify and address common issues across rooms.',
    keywords: ['rooms by topic', 'maintenance topics', 'room issues', 'HotelCare Pro'],
  },
  inventory: {
    title: 'Inventory',
    description: 'Manage hotel maintenance inventory and spare parts with HotelCare Pro. Track stock levels, orders, and usage.',
    keywords: ['inventory', 'spare parts', 'stock management', 'maintenance supplies', 'HotelCare Pro'],
  },
  reports: {
    title: 'Jobs Report',
    description: 'Generate and view hotel maintenance reports with HotelCare Pro. Analyze performance, trends, and operational efficiency.',
    keywords: ['reports', 'analytics', 'maintenance reports', 'performance tracking', 'HotelCare Pro'],
  },
  profile: {
    title: 'Profile',
    description: 'Manage your HotelCare Pro profile settings, preferences, and account information.',
    keywords: ['profile', 'account settings', 'user preferences', 'HotelCare Pro'],
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to HotelCare Pro - Your professional hotel engineering and maintenance management platform.',
    keywords: ['login', 'sign in', 'HotelCare Pro access', 'hotel management'],
  },
  register: {
    title: 'Create Account',
    description: 'Create your HotelCare Pro account and start managing your hotel engineering and maintenance operations.',
    keywords: ['register', 'sign up', 'create account', 'HotelCare Pro'],
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

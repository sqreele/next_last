/**
 * Lightweight in-app dictionary for English and Thai.
 *
 * Scope: high-traffic UI strings (nav, page titles, KPI labels, common
 * actions). Components opt in via the `useT()` hook; anything not opted in
 * keeps its current literal string.
 *
 * Key conventions:
 *   - Dot-separated paths grouped by area (`nav.dashboard`, `kpi.openJobs`).
 *   - Add new strings to *both* locales when you add a key. The TypeScript
 *     compiler enforces this via the `LocaleDictionary` type.
 */

export const DEFAULT_LOCALE = 'en' as const;
export const SUPPORTED_LOCALES = ['en', 'th'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const en = {
  // App chrome
  'app.title': 'PCMS',
  'app.tagline': 'Hotel maintenance management',

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.jobs': 'Jobs',
  'nav.myJobs': 'My Jobs',
  'nav.createJob': 'Create Job',
  'nav.rooms': 'Rooms',
  'nav.areas': 'Areas',
  'nav.preventiveMaintenance': 'Preventive Maintenance',
  'nav.calendar': 'Calendar',
  'nav.inventory': 'Inventory',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',

  // Common actions
  'action.create': 'Create',
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.delete': 'Delete',
  'action.refresh': 'Refresh',
  'action.search': 'Search',
  'action.filter': 'Filter',
  'action.export': 'Export',
  'action.signOut': 'Sign out',
  'action.markAllRead': 'Mark all read',
  'action.viewAll': 'View all',

  // KPI tiles
  'kpi.totalJobs': 'Total jobs',
  'kpi.open': 'Open',
  'kpi.inProgress': 'In progress',
  'kpi.completed': 'Completed',
  'kpi.overdue': 'Overdue',
  'kpi.waitingParts': 'Waiting parts',
  'kpi.preventive': 'Preventive',
  'kpi.completionRate': 'Completion rate',
  'kpi.lastServiced': 'Last serviced',
  'kpi.avgResponse': 'Avg. response',

  // Notifications
  'notifications.title': 'Notifications',
  'notifications.empty': 'All caught up',
  'notifications.emptyHint': 'No overdue or upcoming PM tasks this week.',
  'notifications.overdue': 'Overdue',
  'notifications.dueToday': 'Due today',
  'notifications.upcoming': 'Upcoming',
  'notifications.completed': 'Completed',

  // Theme
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  // Status labels
  'status.pending': 'Pending',
  'status.open': 'Open',
  'status.inProgress': 'In Progress',
  'status.waitingSparepart': 'Waiting Sparepart',
  'status.completed': 'Completed',
  'status.cancelled': 'Cancelled',
  'status.verified': 'Verified',
  'status.overdue': 'Overdue',

  // Empty states
  'empty.noJobs': 'No maintenance jobs found',
  'empty.noJobsHint': 'Adjust the filters or create a new job to see it here.',
  'empty.offline': "You're offline",
  'empty.offlineHint': 'Cached pages remain available. Updates will sync once you reconnect.',
  'empty.offlineRetry': 'Try again',
  'empty.offlineHome': 'Back to dashboard',

  // PWA
  'pwa.installTitle': 'Install PCMS',
  'pwa.installBody': 'Add to your home screen for one-tap access to work orders.',
  'pwa.installButton': 'Install',
  'pwa.updateTitle': 'A new version is ready',
  'pwa.updateBody': 'Reload to pick up the latest features and fixes.',
  'pwa.updateButton': 'Reload',

  // Network
  'network.offline': 'Offline — changes will retry when you reconnect.',
  'network.online': 'Back online — syncing latest jobs.',
  'network.retryNow': 'Retry now',
  'network.queuedSync': 'pending sync',
  'network.syncing': 'Syncing queued updates…',

  // Priority
  'priority.low': 'Low',
  'priority.medium': 'Medium',
  'priority.high': 'High',
  'priority.critical': 'Critical',

  // Forms (CreateJob)
  'form.required': 'Required',
  'form.optional': 'Optional',
  'form.cancel': 'Cancel',
  'form.save': 'Save',
  'form.submitting': 'Submitting…',
  'form.uploadPhoto': 'Upload photo',
  'form.uploadHint': 'JPEG or PNG, up to 5MB.',
  'createJob.title': 'Create maintenance job',
  'createJob.subtitle': 'Fill in all 4 steps: Status & Priority, Location, Job Details, then Evidence.',
  'createJob.step.status': 'Status',
  'createJob.step.location': 'Location',
  'createJob.step.details': 'Details',
  'createJob.step.evidence': 'Evidence',
  'createJob.cta': 'Create maintenance job',
  'createJob.ctaFinishStep': 'Finish step {n} to create job',
  'createJob.creating': 'Creating maintenance job…',

  // Errors / generic
  'error.signInRequired': 'Sign in again to continue.',
  'error.networkRetry': 'Network issue — retrying when you reconnect.',
  'error.generic': 'Something went wrong. Please try again.',
  'error.notFound': 'Not found.',
  'error.forbidden': 'You do not have access to that resource.',
  'error.validation': 'Please check the highlighted fields.',
} as const;

type DictKey = keyof typeof en;

const th: Record<DictKey, string> = {
  'app.title': 'PCMS',
  'app.tagline': 'ระบบจัดการงานซ่อมบำรุงโรงแรม',

  'nav.dashboard': 'แดชบอร์ด',
  'nav.jobs': 'งานทั้งหมด',
  'nav.myJobs': 'งานของฉัน',
  'nav.createJob': 'สร้างงาน',
  'nav.rooms': 'ห้อง',
  'nav.areas': 'พื้นที่',
  'nav.preventiveMaintenance': 'งานบำรุงรักษาเชิงป้องกัน',
  'nav.calendar': 'ปฏิทิน',
  'nav.inventory': 'คลังอะไหล่',
  'nav.reports': 'รายงาน',
  'nav.settings': 'ตั้งค่า',
  'nav.profile': 'โปรไฟล์',

  'action.create': 'สร้าง',
  'action.cancel': 'ยกเลิก',
  'action.save': 'บันทึก',
  'action.delete': 'ลบ',
  'action.refresh': 'รีเฟรช',
  'action.search': 'ค้นหา',
  'action.filter': 'ตัวกรอง',
  'action.export': 'ส่งออก',
  'action.signOut': 'ออกจากระบบ',
  'action.markAllRead': 'อ่านทั้งหมด',
  'action.viewAll': 'ดูทั้งหมด',

  'kpi.totalJobs': 'งานทั้งหมด',
  'kpi.open': 'รอดำเนินการ',
  'kpi.inProgress': 'กำลังทำ',
  'kpi.completed': 'เสร็จแล้ว',
  'kpi.overdue': 'เกินกำหนด',
  'kpi.waitingParts': 'รออะไหล่',
  'kpi.preventive': 'งานบำรุงรักษา',
  'kpi.completionRate': 'อัตราเสร็จ',
  'kpi.lastServiced': 'ซ่อมล่าสุด',
  'kpi.avgResponse': 'เวลาเฉลี่ย',

  'notifications.title': 'การแจ้งเตือน',
  'notifications.empty': 'ไม่มีการแจ้งเตือน',
  'notifications.emptyHint': 'ไม่มีงาน PM เกินกำหนดหรือใกล้ถึงสัปดาห์นี้',
  'notifications.overdue': 'เกินกำหนด',
  'notifications.dueToday': 'ครบกำหนดวันนี้',
  'notifications.upcoming': 'ใกล้ถึง',
  'notifications.completed': 'เสร็จแล้ว',

  'theme.light': 'สว่าง',
  'theme.dark': 'มืด',
  'theme.system': 'ตามระบบ',

  'status.pending': 'รอดำเนินการ',
  'status.open': 'เปิด',
  'status.inProgress': 'กำลังทำ',
  'status.waitingSparepart': 'รออะไหล่',
  'status.completed': 'เสร็จแล้ว',
  'status.cancelled': 'ยกเลิก',
  'status.verified': 'ตรวจสอบแล้ว',
  'status.overdue': 'เกินกำหนด',

  'empty.noJobs': 'ไม่พบงานซ่อม',
  'empty.noJobsHint': 'ปรับตัวกรองหรือสร้างงานใหม่เพื่อให้แสดงที่นี่',
  'empty.offline': 'คุณออฟไลน์อยู่',
  'empty.offlineHint': 'หน้าที่แคชไว้ยังเปิดได้ การอัพเดทจะ sync เมื่อกลับมาออนไลน์',
  'empty.offlineRetry': 'ลองใหม่',
  'empty.offlineHome': 'กลับหน้าหลัก',

  'pwa.installTitle': 'ติดตั้ง PCMS',
  'pwa.installBody': 'เพิ่มไว้หน้าจอหลักเพื่อเข้าถึงงานซ่อมได้รวดเร็ว',
  'pwa.installButton': 'ติดตั้ง',
  'pwa.updateTitle': 'มีเวอร์ชันใหม่พร้อมแล้ว',
  'pwa.updateBody': 'โหลดใหม่เพื่อใช้ฟีเจอร์และแก้ไขล่าสุด',
  'pwa.updateButton': 'โหลดใหม่',

  'network.offline': 'ออฟไลน์ — จะลองใหม่อัตโนมัติเมื่อต่อกลับมา',
  'network.online': 'กลับมาออนไลน์ — กำลังซิงค์งานล่าสุด',
  'network.retryNow': 'ลองตอนนี้',
  'network.queuedSync': 'รอซิงค์',
  'network.syncing': 'กำลังซิงค์งานที่ค้าง…',

  'priority.low': 'ต่ำ',
  'priority.medium': 'ปานกลาง',
  'priority.high': 'สูง',
  'priority.critical': 'วิกฤต',

  'form.required': 'จำเป็น',
  'form.optional': 'ไม่บังคับ',
  'form.cancel': 'ยกเลิก',
  'form.save': 'บันทึก',
  'form.submitting': 'กำลังส่ง…',
  'form.uploadPhoto': 'อัปโหลดรูป',
  'form.uploadHint': 'รองรับ JPEG หรือ PNG ไม่เกิน 5MB',
  'createJob.title': 'สร้างงานซ่อมบำรุง',
  'createJob.subtitle': 'กรอกครบ 4 ขั้น: สถานะ & ความสำคัญ → สถานที่ → รายละเอียด → หลักฐาน',
  'createJob.step.status': 'สถานะ',
  'createJob.step.location': 'สถานที่',
  'createJob.step.details': 'รายละเอียด',
  'createJob.step.evidence': 'หลักฐาน',
  'createJob.cta': 'สร้างงานซ่อม',
  'createJob.ctaFinishStep': 'กรอกขั้นที่ {n} ให้เสร็จก่อนสร้าง',
  'createJob.creating': 'กำลังสร้างงาน…',

  'error.signInRequired': 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  'error.networkRetry': 'ขัดข้องชั่วคราว — ระบบจะลองใหม่อัตโนมัติเมื่อกลับมาออนไลน์',
  'error.generic': 'มีบางอย่างผิดพลาด กรุณาลองใหม่',
  'error.notFound': 'ไม่พบข้อมูล',
  'error.forbidden': 'ไม่มีสิทธิ์เข้าถึงรายการนี้',
  'error.validation': 'กรุณาตรวจสอบช่องที่ทำเครื่องหมาย',
};

export type LocaleDictionary = Record<DictKey, string>;

const DICTIONARIES: Record<Locale, LocaleDictionary> = { en, th };

export function getDictionary(locale: Locale): LocaleDictionary {
  return DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
}

export type { DictKey };

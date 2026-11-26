export type MarketingPage = {
  slug: string;
  locale: "en" | "th";
  title: string;
  metaTitle: string;
  description: string;
  eyebrow: string;
  benefits: Array<{ title: string; description: string }>;
  workflow: string[];
  featureTitle: string;
  features: string[];
  faq: Array<{ question: string; answer: string }>;
};

const en = (
  slug: string,
  title: string,
  metaTitle: string,
  description: string,
  benefits: MarketingPage["benefits"],
  workflow: string[],
  featureTitle: string,
  features: string[],
  faq: MarketingPage["faq"],
): MarketingPage => ({
  slug,
  locale: "en",
  title,
  metaTitle,
  description,
  eyebrow: "StayMaint for hotel operations",
  benefits,
  workflow,
  featureTitle,
  features,
  faq,
});

export const englishMarketingPages: Record<string, MarketingPage> = {
  "hotel-maintenance-software": en(
    "hotel-maintenance-software",
    "Hotel maintenance software built for daily operations",
    "Hotel Maintenance Software for Engineering Teams",
    "Manage hotel work orders, rooms, equipment, technicians and preventive maintenance in one calm, mobile-ready workspace.",
    [
      {
        title: "One operational view",
        description:
          "See active work, urgent rooms and technician ownership without switching tools.",
      },
      {
        title: "Faster response",
        description:
          "Capture clear requests, photos and priorities so engineers can act immediately.",
      },
      {
        title: "Reliable records",
        description:
          "Keep a searchable maintenance history for every room, area and asset.",
      },
    ],
    [
      "A hotel team reports an issue from any device.",
      "Engineering reviews priority, location and supporting photos.",
      "A technician receives the work order and updates progress.",
      "Managers verify completion and review operational trends.",
    ],
    "Everything hotel maintenance teams need",
    [
      "Work orders by room or area",
      "Technician assignment and status tracking",
      "Before-and-after photos",
      "Preventive maintenance schedules",
      "Asset and spare-parts records",
      "Multi-property reports",
    ],
    [
      {
        question: "What is hotel maintenance software?",
        answer:
          "It is an operational system for reporting, assigning, tracking and analyzing maintenance work across hotel rooms, public areas and engineering assets.",
      },
      {
        question: "Can technicians use StayMaint on mobile?",
        answer:
          "Yes. The interface is mobile-first, with touch-friendly actions and concise job cards for work on the move.",
      },
    ],
  ),
  "hotel-engineering-management": en(
    "hotel-engineering-management",
    "Hotel engineering management with clear accountability",
    "Hotel Engineering Management Software",
    "Coordinate engineering teams, room issues, equipment care and management reporting from one structured hotel operations platform.",
    [
      {
        title: "Clear ownership",
        description:
          "Assign every task to the right technician with priority, due time and status.",
      },
      {
        title: "Engineering visibility",
        description:
          "Give chief engineers and general managers a current view of workload and risk.",
      },
      {
        title: "Consistent standards",
        description:
          "Use repeatable workflows across shifts, departments and properties.",
      },
    ],
    [
      "Centralize requests from rooms and operating departments.",
      "Triage work by safety, guest impact and operational urgency.",
      "Coordinate technicians, vendors and required parts.",
      "Review completion evidence, backlog and team performance.",
    ],
    "A practical command center for hotel engineering",
    [
      "Shift-ready work queues",
      "Room and public-area history",
      "Equipment maintenance records",
      "Team workload visibility",
      "Photo and comment timelines",
      "Engineering dashboards",
    ],
    [
      {
        question: "Who uses hotel engineering management software?",
        answer:
          "Chief engineers, maintenance technicians, duty managers, general managers and property administrators use it to coordinate hotel upkeep.",
      },
      {
        question: "Does it support multiple hotels?",
        answer:
          "Yes. StayMaint is designed to separate property data while giving authorized managers a portfolio-level view.",
      },
    ],
  ),
  "preventive-maintenance-hotel": en(
    "preventive-maintenance-hotel",
    "Preventive maintenance for hotel equipment and facilities",
    "Preventive Maintenance Software for Hotels",
    "Plan recurring inspections and service before equipment failure disrupts guests, rooms or hotel operations.",
    [
      {
        title: "Prevent breakdowns",
        description:
          "Schedule work by frequency, due date and equipment requirements.",
      },
      {
        title: "Protect asset life",
        description:
          "Keep service history and completion evidence attached to each machine.",
      },
      {
        title: "Reduce missed tasks",
        description:
          "Give teams a clear list of upcoming, due and overdue maintenance.",
      },
    ],
    [
      "Create a reusable maintenance procedure.",
      "Set the property, asset, frequency and responsible team.",
      "Technicians complete checklists and attach evidence.",
      "Managers monitor compliance and follow up on defects.",
    ],
    "Hotel PM planning without spreadsheet drift",
    [
      "Recurring schedules",
      "Maintenance procedures",
      "Due and overdue queues",
      "Completion checklists",
      "Defect follow-up work orders",
      "PM compliance reporting",
    ],
    [
      {
        question: "What hotel assets need preventive maintenance?",
        answer:
          "Common examples include HVAC, pumps, electrical panels, elevators, kitchen equipment, pools, fire-safety systems and guest-room equipment.",
      },
      {
        question: "Can a failed PM check create follow-up work?",
        answer:
          "StayMaint keeps defects connected to the maintenance record so teams can create and track corrective work.",
      },
    ],
  ),
  "hotel-work-order-system": en(
    "hotel-work-order-system",
    "A hotel work order system that keeps every issue moving",
    "Hotel Work Order System for Maintenance Teams",
    "Turn room and facility issues into prioritized, assigned and traceable work orders with fast updates from the field.",
    [
      {
        title: "Better requests",
        description:
          "Capture the location, problem, priority and photos without exposing unnecessary fields.",
      },
      {
        title: "Predictable workflow",
        description:
          "Move jobs through assigned, in progress, waiting and completed states.",
      },
      {
        title: "Visible service levels",
        description:
          "Track created and due times so teams focus on guest-impacting work.",
      },
    ],
    [
      "Report the room, area and problem.",
      "Set urgency and assign a technician.",
      "Record progress, parts, comments and photos.",
      "Complete, verify and retain the full audit history.",
    ],
    "Purpose-built hotel work orders",
    [
      "Room and area selection",
      "Priority and status controls",
      "Technician assignment",
      "Created and due timestamps",
      "Before-and-after evidence",
      "Searchable work history",
    ],
    [
      {
        question: "How is a hotel work order different from a task?",
        answer:
          "A work order carries operational context such as location, priority, assignee, timestamps, evidence and a complete status history.",
      },
      {
        question: "Can staff report issues without seeing engineering details?",
        answer:
          "Work-order capture can stay concise while detailed technical information remains available to authorized engineering users.",
      },
    ],
  ),
  "hotel-cmms": en(
    "hotel-cmms",
    "A hotel CMMS designed around rooms, guests and engineering teams",
    "Hotel CMMS Software",
    "Combine corrective work, preventive maintenance, assets, inventory and engineering reports in a CMMS tailored to hospitality operations.",
    [
      {
        title: "Hospitality context",
        description:
          "Organize work around properties, rooms, guest areas and hotel equipment.",
      },
      {
        title: "Connected maintenance",
        description:
          "Link reactive jobs, preventive schedules, assets, technicians and parts.",
      },
      {
        title: "Actionable reporting",
        description:
          "Understand backlog, completion, recurring faults and PM performance.",
      },
    ],
    [
      "Build the property, room and asset structure.",
      "Standardize work-order and PM workflows.",
      "Run daily maintenance from mobile and desktop.",
      "Use reliable history to improve planning and budgets.",
    ],
    "Core CMMS capabilities for hotels",
    [
      "Corrective maintenance",
      "Preventive maintenance",
      "Asset registry",
      "Inventory visibility",
      "User permissions",
      "Operational analytics",
    ],
    [
      {
        question: "What does CMMS mean for a hotel?",
        answer:
          "A computerized maintenance management system organizes hotel maintenance work, assets, schedules, parts and records in one system.",
      },
      {
        question: "Is StayMaint only for large properties?",
        answer:
          "No. Its workflow supports individual hotels and multi-property teams without requiring an ecommerce-style or overly complex interface.",
      },
    ],
  ),
  "hotel-asset-management": en(
    "hotel-asset-management",
    "Hotel asset management connected to real maintenance work",
    "Hotel Asset Management Software",
    "Maintain a practical register of hotel equipment with ownership, condition, service history and upcoming maintenance in context.",
    [
      {
        title: "Know each asset",
        description:
          "Store the essential identity and location of equipment without cluttering daily lists.",
      },
      {
        title: "See maintenance history",
        description:
          "Connect breakdowns, inspections and completed service to the asset record.",
      },
      {
        title: "Plan replacement",
        description:
          "Use condition and repair history to support lifecycle and budget decisions.",
      },
    ],
    [
      "Register equipment in its property and area.",
      "Attach relevant specifications and maintenance procedures.",
      "Record corrective and preventive work over time.",
      "Review condition, downtime and recurring repair patterns.",
    ],
    "Asset records your engineers will actually use",
    [
      "Equipment register",
      "Location and ownership",
      "Service history",
      "Preventive schedules",
      "Documents and photos",
      "Repair trend visibility",
    ],
    [
      {
        question: "Which hotel assets can be tracked?",
        answer:
          "Teams can track plant equipment, HVAC, pumps, electrical systems, kitchen assets, laundry equipment, room equipment and other maintainable items.",
      },
      {
        question: "Does asset management replace work orders?",
        answer:
          "No. Asset records provide context and history; work orders manage the actual corrective or preventive activity.",
      },
    ],
  ),
  "hotel-maintenance-checklist": en(
    "hotel-maintenance-checklist",
    "Hotel maintenance checklists that lead to accountable action",
    "Hotel Maintenance Checklist Software",
    "Standardize inspections and recurring hotel maintenance while keeping completion evidence and discovered defects connected.",
    [
      {
        title: "Consistent inspections",
        description:
          "Give every technician the same clear procedure for repeatable work.",
      },
      {
        title: "Visible completion",
        description:
          "Record who completed each check, when it happened and what they found.",
      },
      {
        title: "Defect follow-up",
        description:
          "Turn a failed check into trackable corrective work instead of a lost note.",
      },
    ],
    [
      "Define the equipment or area checklist.",
      "Schedule it at the appropriate operating frequency.",
      "Complete checks on mobile with notes and photos.",
      "Review exceptions and assign corrective actions.",
    ],
    "From checklist to maintenance history",
    [
      "Reusable procedures",
      "Mobile checklist completion",
      "Pass/fail and notes",
      "Photo evidence",
      "Scheduled recurrence",
      "Exception reporting",
    ],
    [
      {
        question: "What should a hotel maintenance checklist include?",
        answer:
          "It should include the asset or area, safe inspection steps, expected condition, frequency, responsible role, completion evidence and a path for reporting defects.",
      },
      {
        question: "Can checklists be reused?",
        answer:
          "Yes. Procedures can be standardized and scheduled repeatedly for the relevant rooms, areas or equipment.",
      },
    ],
  ),
  "hotel-engineering-report": en(
    "hotel-engineering-report",
    "Hotel engineering reports grounded in live maintenance data",
    "Hotel Engineering Report and Dashboard Software",
    "Create clearer engineering reports from work orders, preventive maintenance, room history and technician activity—without rebuilding spreadsheets.",
    [
      {
        title: "Current operational picture",
        description:
          "Review open, in-progress, waiting and completed work with consistent definitions.",
      },
      {
        title: "Management-ready insight",
        description:
          "Communicate backlog, risk and performance without exposing every database field.",
      },
      {
        title: "Traceable evidence",
        description:
          "Move from a summary metric to the underlying job, asset or room history.",
      },
    ],
    [
      "Select the property and reporting period.",
      "Review workload, status, priority and PM indicators.",
      "Investigate exceptions and recurring issues.",
      "Export or share a consistent engineering summary.",
    ],
    "Reporting for engineering and hotel leadership",
    [
      "Work-order status reports",
      "Priority and response trends",
      "Technician workload",
      "Room issue patterns",
      "Preventive maintenance performance",
      "Property filters",
    ],
    [
      {
        question: "What belongs in a hotel engineering report?",
        answer:
          "Useful reports cover open and completed work, urgent risks, recurring faults, preventive maintenance compliance, technician workload and relevant property trends.",
      },
      {
        question: "Can reports be filtered by property?",
        answer:
          "Yes. Authorized users can focus reports on the relevant hotel and time period.",
      },
    ],
  ),
};

export const thaiMarketingPages: Record<string, MarketingPage> = {
  ระบบบำรุงรักษาเชิงป้องกันโรงแรม: {
    slug: "ระบบบำรุงรักษาเชิงป้องกันโรงแรม",
    locale: "th",
    title: "วางแผน PM โรงแรมให้เห็นกำหนดงานและประวัติการบำรุงรักษา",
    metaTitle: "ระบบ PM และบำรุงรักษาเชิงป้องกันโรงแรม",
    description:
      "จัดแผนบำรุงรักษาเชิงป้องกันสำหรับเครื่องจักรโรงแรม กำหนดรอบ PM มอบหมายช่าง และติดตามงานค้างพร้อมประวัติการทำงานใน StayMaint",
    eyebrow: "StayMaint สำหรับงานบำรุงรักษาเชิงป้องกัน",
    benefits: [
      {
        title: "เห็นรอบงานที่ต้องทำ",
        description:
          "ดูงาน PM ตามกำหนดในปฏิทิน แยกงานที่ยังเปิดอยู่ งานเกินกำหนด และงานที่เสร็จแล้วเพื่อเตรียมทีมก่อนเริ่มกะ",
      },
      {
        title: "เชื่อมงานกับเครื่องจักร",
        description:
          "กำหนดเครื่องจักรและแม่แบบงานบำรุงรักษาให้ชัดเจน เพื่อให้ช่างรู้ว่าต้องตรวจอุปกรณ์ใดและใช้ขั้นตอนใด",
      },
      {
        title: "เก็บประวัติแต่ละรอบ",
        description:
          "บันทึกวันปิดงาน ผู้ปฏิบัติงาน หมายเหตุ และรูปภาพไว้กับรายการ PM เพื่อใช้ตรวจสอบและวางแผนรอบถัดไป",
      },
    ],
    workflow: [
      "จัดทะเบียนเครื่องจักร เช่น ปั๊มน้ำหรือเครื่องปรับอากาศ และผูกแม่แบบ PM ที่เหมาะกับอุปกรณ์",
      "กำหนดความถี่ วันเริ่มต้น และผู้รับผิดชอบในแผน PM แล้วตรวจรอบงานในปฏิทิน",
      "ช่างบันทึกผลตรวจ หมายเหตุ และหลักฐานการทำงานในรายการที่ได้รับมอบหมาย",
      "ปิดงานเมื่อทำเสร็จ แล้วตรวจวันนัดรอบถัดไปตามความถี่และรูปแบบแผนที่เลือก",
    ],
    featureTitle: "ข้อมูลสำหรับติดตาม PM โรงแรมในแต่ละกะ",
    features: [
      "แผน PM และปฏิทินงาน",
      "แม่แบบงานตามเครื่องจักร",
      "ความถี่การบำรุงรักษา",
      "ผู้รับผิดชอบและสถานะงาน",
      "รูปภาพและหมายเหตุหน้างาน",
      "ประวัติการปิดงานแต่ละรอบ",
    ],
    faq: [
      {
        question: "งาน PM ต่างจากงานซ่อมเมื่ออุปกรณ์เสียอย่างไร",
        answer:
          "งาน PM เป็นงานตรวจและบำรุงรักษาที่กำหนดล่วงหน้าตามรอบ ส่วนงานซ่อมเกิดจากปัญหาที่พบหน้างาน ทีมควรเก็บทั้งสองประเภทเพื่อดูประวัติและติดตามอุปกรณ์ที่มีปัญหาซ้ำ",
      },
      {
        question: "เลือกเครื่องจักรตอนสร้าง Job แล้วมี PM รอบถัดไปทันทีหรือไม่",
        answer:
          "สำหรับงานเครื่องจักรที่เลือกแม่แบบ PM ระบบสร้างนัดรอบถัดไปเมื่อปิด Job เป็น Completed โดยอ้างอิงความถี่ของแม่แบบ หากมีนัดที่ยังเปิดอยู่หรือมี Master Plan ดูแลรอบงานอยู่แล้ว ระบบจะใช้แผนหรือนัดเดิมเพื่อหลีกเลี่ยงการสร้างซ้ำ",
      },
      {
        question: "ควรกำหนดความถี่ PM ของเครื่องจักรโรงแรมอย่างไร",
        answer:
          "ใช้คู่มือผู้ผลิต ลักษณะการใช้งาน และผลตรวจที่ผ่านมาเป็นข้อมูลตั้งต้น จากนั้นให้ผู้รับผิดชอบด้านวิศวกรรมทบทวนรอบงานให้เหมาะกับอุปกรณ์แต่ละชนิด",
      },
    ],
  },
  ระบบจัดการเครื่องจักรโรงแรม: {
    slug: "ระบบจัดการเครื่องจักรโรงแรม",
    locale: "th",
    title: "รวมทะเบียนเครื่องจักรโรงแรมกับประวัติงานซ่อมและ PM",
    metaTitle: "ระบบจัดการเครื่องจักรและทรัพย์สินโรงแรม",
    description:
      "จัดทะเบียนเครื่องจักรโรงแรม ดูข้อมูลอุปกรณ์ ประวัติงานซ่อม และรอบ PM ใน StayMaint เพื่อส่งต่องานระหว่างกะและทบทวนการบำรุงรักษา",
    eyebrow: "StayMaint สำหรับเครื่องจักรและทรัพย์สินโรงแรม",
    benefits: [
      {
        title: "ระบุอุปกรณ์ได้ตรงตัว",
        description:
          "เก็บรหัสเครื่องจักร ชื่อ ประเภท ยี่ห้อ และหมายเลขเครื่องไว้กับโรงแรมที่ดูแล เพื่อให้ทีมอ้างอิงอุปกรณ์เดียวกัน",
      },
      {
        title: "ตามประวัติได้จากเครื่องจักร",
        description:
          "เชื่อมใบงานเข้ากับเครื่องจักรที่เกี่ยวข้อง แล้วตรวจดูปัญหา หมายเหตุ และหลักฐานในงานที่ผ่านมาเมื่อต้องซ่อมครั้งใหม่",
      },
      {
        title: "เตรียมงานบำรุงรักษา",
        description:
          "ผูกแม่แบบ PM กับเครื่องจักรและตรวจวันบำรุงรักษาที่เกี่ยวข้อง เพื่อให้หัวหน้าช่างเตรียมคนและขั้นตอนก่อนถึงรอบงาน",
      },
    ],
    workflow: [
      "เพิ่มเครื่องจักรในโรงแรมที่รับผิดชอบ พร้อมรหัสและข้อมูลที่ทีมใช้ระบุอุปกรณ์",
      "ผูกแม่แบบ PM ที่เกี่ยวข้องกับเครื่องจักรแต่ละรายการ",
      "เลือกเครื่องจักรเมื่อสร้างใบงาน แล้วบันทึกผลการปฏิบัติงานให้ตรงกับอุปกรณ์",
      "ทบทวนประวัติงานและวันบำรุงรักษา เพื่อส่งต่อข้อมูลให้กะถัดไปและเตรียมแผนดูแลอุปกรณ์",
    ],
    featureTitle: "ทะเบียนอุปกรณ์ที่เชื่อมกับงานประจำวัน",
    features: [
      "รหัสและชื่อเครื่องจักร",
      "ประเภท ยี่ห้อ และหมายเลขเครื่อง",
      "การแยกข้อมูลตามโรงแรม",
      "แม่แบบ PM ของอุปกรณ์",
      "ใบงานที่เกี่ยวข้อง",
      "ประวัติการบำรุงรักษา",
    ],
    faq: [
      {
        question: "ควรเริ่มทำทะเบียนเครื่องจักรจากอุปกรณ์ใดก่อน",
        answer:
          "เริ่มจากอุปกรณ์ที่มีผลต่อการให้บริการ เช่น ระบบปรับอากาศ ปั๊มน้ำ หรืออุปกรณ์ส่วนกลาง โดยกำหนดรหัสให้ทีมใช้ร่วมกัน แล้วค่อยเพิ่มอุปกรณ์อื่นตามความพร้อมของข้อมูล",
      },
      {
        question: "เครื่องจักรกับห้องพักต้องจัดเก็บแยกกันหรือไม่",
        answer:
          "ระบบมีข้อมูลเครื่องจักรและห้องพักแยกกัน เมื่อสร้างใบงานให้เลือกตำแหน่งหรืออุปกรณ์ตามปัญหาที่เกิดขึ้น เพื่อให้การติดตามประวัติอ้างอิงรายการที่ถูกต้อง",
      },
      {
        question: "ประวัติเครื่องจักรช่วยหัวหน้าช่างอย่างไร",
        answer:
          "หัวหน้าช่างใช้ประวัติดูงานที่เคยทำ ปัญหาที่เกิดซ้ำ และการบำรุงรักษาที่เกี่ยวข้อง เป็นข้อมูลประกอบการตรวจอุปกรณ์และจัดเตรียมงานครั้งต่อไป",
      },
    ],
  },
  รายงานงานช่างโรงแรม: {
    slug: "รายงานงานช่างโรงแรม",
    locale: "th",
    title: "รายงานงานช่างโรงแรมจากใบงานและหลักฐานที่ตรวจสอบได้",
    metaTitle: "รายงานงานช่างและงานซ่อมบำรุงโรงแรม",
    description:
      "ติดตามงานค้าง งานเสร็จ และการบำรุงรักษาโรงแรมจากข้อมูลใบงานใน StayMaint พร้อมใช้รายงานและหลักฐานประกอบการส่งต่องานและประชุมฝ่ายช่าง",
    eyebrow: "StayMaint สำหรับรายงานฝ่ายช่างโรงแรม",
    benefits: [
      {
        title: "เห็นงานที่ต้องติดตาม",
        description:
          "ดูสถานะงานและรายการที่ยังไม่เสร็จ เพื่อให้หัวหน้าช่างจัดลำดับการติดตามงานก่อนส่งกะหรือประชุมประจำวัน",
      },
      {
        title: "กลับไปตรวจหลักฐานได้",
        description:
          "เชื่อมข้อมูลสรุปกับใบงาน หมายเหตุ และรูปก่อน–หลัง เพื่ออธิบายรายละเอียดของปัญหาและสิ่งที่ทีมทำไปแล้ว",
      },
      {
        title: "แยกบริบทแต่ละโรงแรม",
        description:
          "เลือกโรงแรมและช่วงเวลาที่ต้องการทบทวนตามสิทธิ์การเข้าถึง เพื่อสรุปงานให้ตรงกับทีมและรอบการประชุม",
      },
    ],
    workflow: [
      "เลือกโรงแรมและช่วงเวลาที่ต้องการสรุปงาน เช่น รอบส่งกะหรือรายงานประจำเดือน",
      "ตรวจว่าช่างอัปเดตสถานะ ผู้รับผิดชอบ หมายเหตุ และหลักฐานของใบงานที่เกี่ยวข้องแล้ว",
      "ทบทวนงานค้าง งานเสร็จ และรายการ PM พร้อมเปิดรายละเอียดเมื่อพบงานที่ต้องติดตาม",
      "ใช้รายงานประกอบการประชุม กำหนดผู้ติดตามงาน และบันทึกสิ่งที่ต้องทำต่อในใบงาน",
    ],
    featureTitle: "ข้อมูลประกอบการส่งกะและรายงานหัวหน้าช่าง",
    features: [
      "สถานะและรายการใบงาน",
      "งานค้างที่ต้องติดตาม",
      "ผู้รับผิดชอบงานแต่ละรายการ",
      "ประวัติงาน PM",
      "รูปภาพและหมายเหตุประกอบงาน",
      "รายงานสำหรับทบทวนผลการทำงาน",
    ],
    faq: [
      {
        question: "รายงานงานช่างโรงแรมควรมีข้อมูลอะไรบ้าง",
        answer:
          "ควรระบุช่วงเวลารายงาน งานที่เปิดและปิด งานเร่งด่วนที่ยังค้าง ผู้รับผิดชอบ และรายการที่ต้องติดตามต่อ พร้อมอ้างอิงใบงานเมื่อจำเป็นต้องตรวจรายละเอียด",
      },
      {
        question: "ข้อมูลรายงานมาจากที่ใด",
        answer:
          "รายงานอาศัยข้อมูลที่ทีมบันทึกในระบบ เช่น สถานะใบงาน การมอบหมาย หมายเหตุ และวันทำงาน ความครบถ้วนจึงขึ้นอยู่กับการอัปเดตข้อมูลหน้างานของทีมด้วย",
      },
      {
        question: "ดูตัวอย่างรายงานก่อนเริ่มใช้งานได้หรือไม่",
        answer:
          "เปิด Live Demo เพื่อดูตัวอย่างใบงานและรายงานจากข้อมูลสาธิตได้ ข้อมูลตัวอย่างใช้แสดงขั้นตอนการใช้งาน และไม่ใช่ผลลัพธ์การดำเนินงานของลูกค้าจริง",
      },
    ],
  },
  ระบบแจ้งซ่อมโรงแรม: {
    slug: "ระบบแจ้งซ่อมโรงแรม",
    locale: "th",
    title: "ระบบแจ้งซ่อมโรงแรมที่ติดตามงานได้จริง",
    metaTitle: "ระบบแจ้งซ่อมโรงแรมสำหรับทีมช่าง",
    description:
      "รับแจ้งปัญหาจากห้องพักและพื้นที่ต่าง ๆ จัดลำดับความสำคัญ มอบหมายช่าง และติดตามสถานะงานซ่อมในระบบเดียว",
    eyebrow: "StayMaint สำหรับงานโรงแรม",
    benefits: [
      {
        title: "แจ้งงานได้รวดเร็ว",
        description:
          "ระบุห้องหรือพื้นที่ ปัญหา ความเร่งด่วน และแนบรูปได้จากมือถือ",
      },
      {
        title: "รู้ว่าใครรับผิดชอบ",
        description: "มอบหมายช่างพร้อมติดตามสถานะและเวลาที่สร้างหรือครบกำหนด",
      },
      {
        title: "มีประวัติที่ตรวจสอบได้",
        description:
          "เก็บความคิดเห็น รูปก่อน–หลัง และลำดับการเปลี่ยนสถานะของงาน",
      },
    ],
    workflow: [
      "พนักงานแจ้งห้องหรือพื้นที่และอธิบายปัญหา",
      "หัวหน้าช่างประเมินความสำคัญและมอบหมายงาน",
      "ช่างอัปเดตสถานะ หมายเหตุ อะไหล่ และรูปภาพ",
      "หัวหน้างานตรวจรับและใช้ประวัติสำหรับวางแผนครั้งต่อไป",
    ],
    featureTitle: "ข้อมูลสำคัญครบ โดยไม่ทำให้หน้าจอรก",
    features: [
      "งานซ่อมตามห้องและพื้นที่",
      "สถานะและระดับความสำคัญ",
      "การมอบหมายช่าง",
      "รูปก่อนและหลังซ่อม",
      "ประวัติความคิดเห็น",
      "รายงานงานค้างและงานเสร็จ",
    ],
    faq: [
      {
        question: "ระบบแจ้งซ่อมโรงแรมต่างจากการแจ้งในแชตอย่างไร",
        answer:
          "ระบบเก็บผู้รับผิดชอบ สถานะ เวลา หลักฐาน และประวัติไว้กับงานแต่ละรายการ จึงค้นหาและติดตามได้โดยไม่ตกหล่นในข้อความสนทนา",
      },
      {
        question: "ช่างใช้งานผ่านมือถือได้หรือไม่",
        answer:
          "ได้ หน้าจอออกแบบแบบ mobile-first ปุ่มมีขนาดเหมาะกับการสัมผัสและแสดงเฉพาะข้อมูลที่ต้องใช้หน้างาน",
      },
    ],
  },
  ระบบบริหารงานซ่อมบำรุงโรงแรม: {
    slug: "ระบบบริหารงานซ่อมบำรุงโรงแรม",
    locale: "th",
    title: "ระบบบริหารงานซ่อมบำรุงโรงแรมแบบครบวงจร",
    metaTitle: "ระบบบริหารงานซ่อมบำรุงโรงแรม",
    description:
      "บริหารใบงาน แผนบำรุงรักษาเชิงป้องกัน เครื่องจักร อะไหล่ ห้องพัก ทีมช่าง และรายงานวิศวกรรมในแพลตฟอร์มเดียว",
    eyebrow: "แพลตฟอร์มบริหารฝ่ายช่างโรงแรม",
    benefits: [
      {
        title: "เห็นภาพงานทั้งโรงแรม",
        description:
          "รวมงานซ่อม งาน PM เครื่องจักร ห้องพัก และภาระงานของช่างไว้ในมุมมองเดียว",
      },
      {
        title: "ลดงานตกหล่น",
        description:
          "ใช้ขั้นตอน สถานะ ผู้รับผิดชอบ และกำหนดเวลาที่ชัดเจนในทุกกะ",
      },
      {
        title: "ตัดสินใจจากข้อมูลจริง",
        description:
          "ดูงานค้าง ปัญหาที่เกิดซ้ำ ประวัติเครื่องจักร และผลการบำรุงรักษา",
      },
    ],
    workflow: [
      "จัดโครงสร้างโรงแรม ห้อง พื้นที่ และเครื่องจักร",
      "กำหนดขั้นตอนงานซ่อมและแผน PM มาตรฐาน",
      "ให้ทีมปฏิบัติงานและอัปเดตข้อมูลจากหน้างาน",
      "วิเคราะห์งานค้าง ประสิทธิภาพ และความเสี่ยงเพื่อปรับแผน",
    ],
    featureTitle: "เครื่องมือสำหรับหัวหน้าช่างและทีมปฏิบัติการ",
    features: [
      "ใบแจ้งซ่อมและใบงาน",
      "บำรุงรักษาเชิงป้องกัน",
      "ทะเบียนเครื่องจักรและทรัพย์สิน",
      "สต็อกอะไหล่",
      "ประวัติห้องพัก",
      "แดชบอร์ดและรายงานวิศวกรรม",
    ],
    faq: [
      {
        question: "เหมาะกับโรงแรมหลายสาขาหรือไม่",
        answer:
          "เหมาะ ระบบแยกข้อมูลตามโรงแรมและสิทธิ์ผู้ใช้ พร้อมมุมมองสำหรับผู้บริหารที่ดูแลหลายสาขา",
      },
      {
        question: "ต้องเปลี่ยนกระบวนการฝ่ายช่างทั้งหมดหรือไม่",
        answer:
          "ไม่จำเป็น สามารถเริ่มจากงานแจ้งซ่อมและค่อยเพิ่มแผน PM เครื่องจักร อะไหล่ และรายงานตามความพร้อมของทีม",
      },
    ],
  },
};

export const relatedMarketingLinks = [
  { href: "/hotel-maintenance-software", label: "Hotel maintenance software" },
  { href: "/hotel-engineering-management", label: "Engineering management" },
  { href: "/preventive-maintenance-hotel", label: "Preventive maintenance" },
  { href: "/hotel-work-order-system", label: "Work order system" },
  { href: "/hotel-cmms", label: "Hotel CMMS" },
  { href: "/hotel-asset-management", label: "Asset management" },
  { href: "/hotel-maintenance-checklist", label: "Maintenance checklists" },
  { href: "/hotel-engineering-report", label: "Engineering reports" },
  { href: "/th/ระบบแจ้งซ่อมโรงแรม", label: "ระบบแจ้งซ่อมโรงแรม" },
  {
    href: "/th/ระบบบริหารงานซ่อมบำรุงโรงแรม",
    label: "ระบบบริหารงานซ่อมบำรุงโรงแรม",
  },
  { href: "/th/ระบบบำรุงรักษาเชิงป้องกันโรงแรม", label: "ระบบ PM โรงแรม" },
  { href: "/th/ระบบจัดการเครื่องจักรโรงแรม", label: "การจัดการเครื่องจักรโรงแรม" },
  { href: "/th/รายงานงานช่างโรงแรม", label: "รายงานงานช่างโรงแรม" },
];

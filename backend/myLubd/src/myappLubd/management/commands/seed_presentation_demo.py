from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from myappLubd.models import (
    Area,
    Inventory,
    InventoryCategory,
    InventoryUsage,
    Job,
    JobComment,
    Machine,
    PreventiveMaintenance,
    Property,
    Room,
    TenantMembership,
    Topic,
)


DEMO_JOB_PREFIX = "DEMO-CT-"
DEMO_INVENTORY_PREFIX = "DEMO-CT-INV-"
DEMO_PM_PREFIX = "DEMOCTPM"
DEMO_MARKER = "[DEMO-PRESENTATION-CHINATOWN]"


class Command(BaseCommand):
    help = "Seed or remove the isolated Chinatown presentation dataset."

    def add_arguments(self, parser):
        parser.add_argument(
            "--property-id",
            default="PB749146D",
            help="Canonical Property.property_id to receive the demo data.",
        )
        action = parser.add_mutually_exclusive_group()
        action.add_argument("--apply", action="store_true", help="Create the demo dataset.")
        action.add_argument("--cleanup", action="store_true", help="Permanently remove only this demo dataset.")

    def handle(self, *args, **options):
        property_obj = Property.objects.select_related("tenant").filter(
            property_id=options["property_id"]
        ).first()
        if property_obj is None:
            raise CommandError(f"Property {options['property_id']!r} was not found.")

        if options["cleanup"]:
            self._cleanup(property_obj)
            return
        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: would seed 12 jobs, 2 PM tasks, 4 inventory items, "
                    f"4 comments, and 2 usage records into {property_obj.name}. "
                    "Pass --apply to create them."
                )
            )
            return

        self._apply(property_obj)

    @transaction.atomic
    def _apply(self, property_obj):
        existing = {
            "jobs": Job.all_objects.filter(job_id__startswith=DEMO_JOB_PREFIX).count(),
            "pm": PreventiveMaintenance.objects.filter(pm_id__startswith=DEMO_PM_PREFIX).count(),
            "inventory": Inventory.objects.filter(item_id__startswith=DEMO_INVENTORY_PREFIX).count(),
        }
        if any(existing.values()):
            raise CommandError(
                f"Demo data already exists ({existing}). Run with --cleanup before reseeding."
            )

        members = TenantMembership.objects.filter(
            tenant=property_obj.tenant,
            is_active=True,
            properties=property_obj,
            user__is_active=True,
        ).select_related("user")
        creator_membership = members.filter(role__in=("owner", "admin", "manager")).first()
        if creator_membership is None:
            raise CommandError("No active Chinatown admin or manager is available as demo creator.")
        creator = creator_membership.user
        technicians = list(members.filter(role="technician").order_by("user_id"))
        assignees = [membership.user for membership in technicians] or [creator]

        room_names = ["306", "315", "402", "420", "501", "520", "601", "620"]
        rooms = {
            room.name: room
            for room in Room.objects.filter(
                property=property_obj,
                name__in=room_names,
                is_active=True,
            )
        }
        missing_rooms = sorted(set(room_names) - set(rooms))
        if missing_rooms:
            raise CommandError(f"Required demo rooms are missing: {', '.join(missing_rooms)}")

        lobby = Area.objects.filter(property=property_obj, name="Lobby", is_active=True).first()
        if lobby is None:
            raise CommandError("The active Chinatown Lobby area was not found.")

        topic_keywords = {
            "air": "Air-Conditions",
            "bathroom": "Barth Room",
            "door": "Door(",
            "internet": "Internet and TV",
            "lighting": "Ligthting",
            "other": "Orther",
            "paint": "Wall and Repaint",
            "water_leak": "Water Leasks",
            "hot_water": "Water and Hot water",
            "pm": "PM (ทำความสะอาดฟิลเตอร์แอร์)",
        }
        topics = {}
        for key, keyword in topic_keywords.items():
            topic = Topic.objects.filter(title__icontains=keyword).first()
            if topic is None:
                raise CommandError(f"Required demo topic containing {keyword!r} was not found.")
            topics[key] = topic

        now = timezone.now()
        specs = [
            ("0001", "pending", "critical", 0, "306", "water_leak", "น้ำรั่วจากฝ้าในห้องพัก", "พบคราบน้ำบริเวณหน้าห้องน้ำ"),
            ("0002", "pending", "high", 1, "402", "air", "เครื่องปรับอากาศไม่เย็น", "อุณหภูมิห้องสูงกว่าค่าที่ตั้งไว้"),
            ("0003", "pending", "medium", 2, None, "lighting", "ไฟบริเวณ Lobby กะพริบ", "ตรวจสอบหลอดไฟและชุดควบคุม"),
            ("0004", "in_progress", "high", 4, "501", "air", "คอยล์เย็นมีเสียงดังผิดปกติ", "ช่างกำลังตรวจสอบพัดลม FCU"),
            ("0005", "in_progress", "medium", 6, "315", "door", "กลอนประตูห้องพักฝืด", "อยู่ระหว่างปรับตั้งและหล่อลื่น"),
            ("0006", "waiting_sparepart", "high", 9, "520", "hot_water", "น้ำร้อนไม่สม่ำเสมอ", "รออะไหล่วาล์วควบคุมอุณหภูมิ"),
            ("0007", "completed", "medium", 14, "601", "internet", "โทรทัศน์รับสัญญาณไม่ได้", "เปลี่ยนสายสัญญาณและทดสอบแล้ว"),
            ("0008", "completed", "high", 20, "620", "bathroom", "ชักโครกกดน้ำไม่ลง", "เปลี่ยนชุดวาล์วน้ำเข้าเรียบร้อย"),
            ("0009", "completed", "low", 28, "420", "paint", "ผนังมีรอยถลอก", "เก็บสีและทำความสะอาดพื้นที่แล้ว"),
            ("0010", "completed", "medium", 35, "306", "pm", "ล้างฟิลเตอร์เครื่องปรับอากาศตามแผน", "ดำเนินการ PM และบันทึกผลเรียบร้อย"),
            ("0011", "completed", "medium", 45, None, "lighting", "เปลี่ยนหลอดไฟทางเดินชั้น 2", "เปลี่ยนเป็นหลอด LED และทดสอบแล้ว"),
            ("0012", "cancelled", "low", 55, "402", "other", "รายการแจ้งซ้ำสำหรับทดสอบ Workflow", "ยกเลิกเนื่องจากเป็นรายการซ้ำ"),
        ]

        jobs = []
        for index, (suffix, status, priority, days_ago, room_name, topic_key, description, remarks) in enumerate(specs):
            created_at = now - timedelta(days=days_ago, hours=index)
            completed_at = created_at + timedelta(hours=3) if status == "completed" else None
            jobs.append(
                Job(
                    job_id=f"{DEMO_JOB_PREFIX}{suffix}",
                    user=assignees[index % len(assignees)],
                    updated_by=creator,
                    property=property_obj,
                    area=lobby if room_name is None else None,
                    description=f"[DEMO] {description}",
                    remarks=f"{DEMO_MARKER} {remarks}",
                    status=status,
                    priority=priority,
                    is_defective=status not in {"cancelled"},
                    is_preventivemaintenance=suffix == "0010",
                    created_at=created_at,
                    updated_at=completed_at or created_at + timedelta(hours=1),
                    completed_at=completed_at,
                )
            )
        Job.objects.bulk_create(jobs)

        Job.rooms.through.objects.bulk_create(
            [
                Job.rooms.through(job_id=job.pk, room_id=rooms[specs[index][4]].pk)
                for index, job in enumerate(jobs)
                if specs[index][4] is not None
            ]
        )
        Job.topics.through.objects.bulk_create(
            [
                Job.topics.through(job_id=job.pk, topic_id=topics[specs[index][5]].pk)
                for index, job in enumerate(jobs)
            ]
        )

        comment_specs = [
            (jobs[0], creator, "[DEMO] กรุณากั้นพื้นที่ก่อนเข้าตรวจสอบ"),
            (jobs[3], assignees[0], "[DEMO] ตรวจพบลูกปืนพัดลมเริ่มสึก กำลังประเมินอะไหล่"),
            (jobs[5], creator, "[DEMO] อนุมัติสั่งอะไหล่และแจ้งกำหนดส่งแล้ว"),
            (jobs[7], assignees[0], "[DEMO] ทดสอบการกดน้ำ 5 รอบ ระบบทำงานปกติ"),
        ]
        JobComment.objects.bulk_create(
            [JobComment(job=job, author=author, comment=comment) for job, author, comment in comment_specs]
        )

        engineer_room = Room.objects.filter(
            property=property_obj, name="1900", is_active=True
        ).first()
        if engineer_room is None:
            raise CommandError("The active Chinatown Engineer Room 1900 was not found.")
        categories = {
            category.code: category
            for category in InventoryCategory.objects.filter(
                tenant=property_obj.tenant,
                code__in=("tools", "parts", "supplies", "safety_equipment"),
                is_active=True,
            )
        }
        if len(categories) != 4:
            raise CommandError("One or more required demo inventory categories are missing.")

        inventory_specs = [
            ("001", "tools", "[DEMO] ชุดเครื่องมือช่างอเนกประสงค์", 8, 2, Decimal("1850.00")),
            ("002", "parts", "[DEMO] ฟิลเตอร์แอร์สำรอง", 3, 5, Decimal("420.00")),
            ("003", "supplies", "[DEMO] หลอดไฟ LED 12W", 20, 5, Decimal("95.00")),
            ("004", "safety_equipment", "[DEMO] ชุดอุปกรณ์ PPE", 0, 2, Decimal("750.00")),
        ]
        inventory_items = []
        for suffix, category_code, name, quantity, minimum, unit_price in inventory_specs:
            status = "out_of_stock" if quantity == 0 else "low_stock" if quantity < minimum else "available"
            inventory_items.append(
                Inventory(
                    item_id=f"{DEMO_INVENTORY_PREFIX}{suffix}",
                    name=name,
                    description=DEMO_MARKER,
                    category=categories[category_code],
                    quantity=quantity,
                    min_quantity=minimum,
                    max_quantity=30,
                    unit="pcs",
                    unit_price=unit_price,
                    location="Engineer Room 1900",
                    status=status,
                    property=property_obj,
                    room=engineer_room,
                    notes="Demo data; safe to remove with seed_presentation_demo --cleanup.",
                    created_by=creator,
                )
            )
        Inventory.objects.bulk_create(inventory_items)

        machine = Machine.objects.filter(property=property_obj, status="active").order_by("id").first()
        if machine is None:
            raise CommandError("No active Chinatown machine is available for the PM demo.")
        pm_records = [
            PreventiveMaintenance(
                job=jobs[9],
                pmtitle="[DEMO] PM ล้างฟิลเตอร์เครื่องปรับอากาศ",
                pm_id=f"{DEMO_PM_PREFIX}001",
                scheduled_date=jobs[9].created_at,
                completed_date=jobs[9].completed_at,
                frequency="monthly",
                next_due_date=now + timedelta(days=25),
                notes=DEMO_MARKER,
                procedure="ถอดฟิลเตอร์ ล้าง ทำให้แห้ง และประกอบกลับ",
                priority="medium",
                estimated_duration=45,
                actual_duration=38,
                status="completed",
                completed_by=assignees[0],
                completion_notes="ตรวจสอบแรงลมหลังประกอบกลับแล้ว",
                quality_score=9,
                verified_by=creator,
                verification_date=jobs[9].completed_at,
                created_by=creator,
                assigned_to=assignees[0],
                remarks=DEMO_MARKER,
            ),
            PreventiveMaintenance(
                pmtitle="[DEMO] ตรวจเช็กชุดคอยล์ร้อนประจำเดือน",
                pm_id=f"{DEMO_PM_PREFIX}002",
                scheduled_date=now + timedelta(days=5),
                frequency="monthly",
                next_due_date=now + timedelta(days=35),
                notes=DEMO_MARKER,
                procedure="ตรวจแรงดัน น้ำยา กระแสไฟ และทำความสะอาดคอยล์",
                priority="high",
                estimated_duration=60,
                status="pending",
                created_by=creator,
                assigned_to=assignees[-1],
                remarks=DEMO_MARKER,
            ),
        ]
        PreventiveMaintenance.objects.bulk_create(pm_records)
        PreventiveMaintenance.topics.through.objects.bulk_create(
            [
                PreventiveMaintenance.topics.through(
                    preventivemaintenance_id=record.pk,
                    topic_id=topics["pm"].pk,
                )
                for record in pm_records
            ]
        )
        Machine.preventive_maintenances.through.objects.bulk_create(
            [
                Machine.preventive_maintenances.through(
                    machine_id=machine.pk,
                    preventivemaintenance_id=record.pk,
                )
                for record in pm_records
            ]
        )

        InventoryUsage.objects.bulk_create(
            [
                InventoryUsage(
                    inventory=inventory_items[1],
                    job=jobs[3],
                    property=property_obj,
                    quantity=1,
                    unit_cost=inventory_items[1].unit_price,
                    total_cost=inventory_items[1].unit_price,
                    source="job",
                    notes=DEMO_MARKER,
                    consumed_by=assignees[0],
                    consumed_at=jobs[3].created_at + timedelta(hours=2),
                ),
                InventoryUsage(
                    inventory=inventory_items[2],
                    job=jobs[10],
                    property=property_obj,
                    quantity=2,
                    unit_cost=inventory_items[2].unit_price,
                    total_cost=inventory_items[2].unit_price * 2,
                    source="job",
                    notes=DEMO_MARKER,
                    consumed_by=assignees[0],
                    consumed_at=jobs[10].created_at + timedelta(hours=1),
                ),
            ]
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Created Chinatown demo dataset: {len(jobs)} jobs, {len(pm_records)} PM tasks, "
                f"{len(inventory_items)} inventory items, {len(comment_specs)} comments, 2 usage records."
            )
        )

    @transaction.atomic
    def _cleanup(self, property_obj):
        jobs = Job.all_objects.filter(
            property=property_obj,
            job_id__startswith=DEMO_JOB_PREFIX,
        )
        inventory = Inventory.objects.filter(
            property=property_obj,
            item_id__startswith=DEMO_INVENTORY_PREFIX,
        )
        pm = PreventiveMaintenance.objects.filter(pm_id__startswith=DEMO_PM_PREFIX)
        counts = {
            "jobs": jobs.count(),
            "pm": pm.count(),
            "inventory": inventory.count(),
        }
        InventoryUsage.objects.filter(inventory__in=inventory).delete()
        pm.delete()
        jobs.hard_delete()
        inventory.delete()
        self.stdout.write(self.style.SUCCESS(f"Removed Chinatown demo dataset: {counts}."))

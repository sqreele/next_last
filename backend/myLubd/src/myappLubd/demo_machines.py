"""Repeatable machine assets and work history for the isolated public demo."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .demo_categories import machine_category_flags
from .models import DemoJobMachine, Job, JobComment, Machine, PreventiveMaintenance, Topic


@transaction.atomic
def seed_demo_machines(property_obj, technicians):
    now = timezone.now()
    # All identifiers and supplier details below are fictional demonstration data.
    specs = [
        ('HVAC', 'Demo Condensing Unit', 'HVAC', 'Rooftop', 'Daikin', 'active', 'ชุดคอยล์ร้อน 120,000 BTU สำหรับพื้นที่ส่วนกลาง ตรวจแรงดันน้ำยาและทำความสะอาดคอยล์ทุกเดือน'),
        ('PUMP', 'Demo Booster Pump', 'Water Pump', 'Pump Room B1', 'Grundfos', 'repair', 'ปั๊มเพิ่มแรงดันน้ำ 5.5 kW ตรวจพบซีลรั่ว ใช้ปั๊มสำรองระหว่างรออะไหล่'),
        ('GEN', 'Demo Emergency Generator', 'Generator', 'Generator Room B1', 'Cummins', 'active', 'เครื่องกำเนิดไฟฟ้าสำรอง 250 kVA ทดสอบเดินเครื่องและระบบ ATS ทุกสัปดาห์'),
        ('LIFT', 'Demo Guest Lift', 'Elevator', 'Lobby / Floors 1–8', 'Mitsubishi', 'maintenance', 'ลิฟต์โดยสาร 1,000 kg ปิดให้บริการระหว่างตรวจระบบประตูตามสัญญาบริการ ใช้ลิฟต์สำรอง'),
        ('HOT', 'Demo Hot Water Tank', 'Hot Water', 'Utility Room 8F', 'Stiebel Eltron', 'active', 'ถังน้ำร้อน 1,000 ลิตร ตั้งค่า 60°C ตรวจวาล์วนิรภัยและตะกรันตามแผน'),
        ('AHU', 'Demo Lobby Air Handling Unit', 'HVAC', 'Lobby Plant Room', 'Carrier', 'inactive', 'ชุดจ่ายอากาศ Lobby หยุดใช้งานชั่วคราวระหว่างปรับปรุงพื้นที่ ตรวจฟิลเตอร์ก่อนเปิดระบบ'),
    ]
    machines = {}
    for index, (code, name, category, location, brand, status, description) in enumerate(specs):
        machines[code], _ = Machine.objects.update_or_create(
            property=property_obj, machine_id=f'DEMO-{code}-001',
            defaults={
                'name': name, 'category': category, 'location': location, 'brand': brand,
                'status': status, 'description': description,
                'serial_number': f'DEMO-SN-{code}-001', 'asset_tag': f'CT-EQ-{index + 1:03d}',
                'installation_date': (now - timedelta(days=730 + index * 90)).date(),
                'last_maintenance_date': now - timedelta(days=7 + index * 3),
                'warranty_end_date': (now + timedelta(days=180 - index * 120)).date(),
            },
        )

    work = [
        ('HVAC', 'Preventive Monthly', 'completed', 'medium', 7, 'ล้างคอยล์ร้อนและตรวจแรงดันน้ำยา', 'ล้างคอยล์ ตรวจแรงดัน 120 psi และกระแสไฟ 18 A ทดสอบเดินเครื่องปกติ'),
        ('PUMP', 'Repair', 'waiting_sparepart', 'high', 2, 'ซ่อมซีลปั๊มเพิ่มแรงดันน้ำรั่ว', 'แยกปั๊มหลักและเปิดปั๊มสำรอง รอ mechanical seal ขนาด 32 mm'),
        ('GEN', 'Preventive Weekly', 'completed', 'medium', 3, 'ทดสอบเครื่องกำเนิดไฟฟ้าและ ATS', 'เดินเครื่อง 30 นาที แรงดัน 400 V ความถี่ 50 Hz ทดสอบ ATS ผ่าน'),
        ('LIFT', 'Service Contract', 'in_progress', 'high', 1, 'ตรวจระบบประตูลิฟต์ตามสัญญาบริการ', 'ผู้รับเหมากำลังปรับตั้ง door sensor และตรวจระบบ interlock'),
        ('HOT', 'Change Part', 'completed', 'medium', 10, 'เปลี่ยนวาล์วนิรภัยถังน้ำร้อน', 'เปลี่ยนวาล์ว 6 bar และทดสอบการรั่ว อุณหภูมิจ่าย 60°C'),
        ('AHU', 'Other', 'pending', 'low', 0, 'ตรวจความพร้อม AHU ก่อนเปิดพื้นที่ Lobby', 'ตรวจสายพาน ฟิลเตอร์ และจุดยึดก่อนเปิดใช้งานหลังปรับปรุง'),
        ('HOT', 'Preventive Yearly', 'pending', 'medium', 0, 'ตรวจถังน้ำร้อนประจำปี', 'วางแผนล้างตะกรัน ตรวจ anode และทดสอบวาล์วนิรภัย'),
        ('HVAC', 'PM', 'in_progress', 'medium', 0, 'ตรวจสภาพและทำความสะอาดชุดคอยล์ร้อน', 'ช่างกำลังตรวจจุดต่อไฟฟ้าและอุณหภูมิท่อก่อนส่งมอบ'),
    ]
    for index, (code, category, status, priority, days, title, remarks) in enumerate(work):
        technician = technicians[index % len(technicians)]
        created = now - timedelta(days=days, hours=4)
        job_id = f'DEMO-CT-M{index + 1:03d}'
        job = Job.all_objects.filter(job_id=job_id, property=property_obj).first()
        created_job = job is None
        if created_job:
            job = Job(job_id=job_id, property=property_obj, **{
                'user': technician, 'updated_by': technician,
                'description': f'[DEMO] {title}', 'remarks': remarks,
                'status': status, 'priority': priority,
                'created_at': created, 'updated_at': created + timedelta(hours=2),
                'completed_at': created + timedelta(hours=2) if status == 'completed' else None,
                **machine_category_flags(category),
            })
            # Preserve historical timestamps and avoid workflow notifications.
            Job.objects.bulk_create([job])
        DemoJobMachine.objects.get_or_create(job=job, defaults={'machine': machines[code]})
        if job.status == 'completed' and job.completed_at and job.completed_at > machines[code].last_maintenance_date:
            machines[code].last_maintenance_date = job.completed_at
            Machine.objects.filter(pk=machines[code].pk).update(last_maintenance_date=job.completed_at)
        topic, _ = Topic.objects.get_or_create(title=category)
        job.topics.add(topic)
        if created_job:
            JobComment.objects.bulk_create([JobComment(job=job, author=technician, comment=f'[DEMO] {remarks}')])

    plans = [
        ('HVAC', 'monthly', 5, 'ตรวจคอยล์ร้อนประจำเดือน', 'ตรวจแรงดันน้ำยา กระแสไฟ จุดต่อไฟฟ้า และทำความสะอาดคอยล์'),
        ('PUMP', 'weekly', -2, 'ตรวจระบบปั๊มน้ำประจำสัปดาห์', 'ตรวจแรงดัน 3–4 bar การรั่วซึม ซีล และสลับปั๊มสำรอง'),
        ('GEN', 'weekly', 3, 'ทดสอบเครื่องกำเนิดไฟฟ้าประจำสัปดาห์', 'ตรวจน้ำมัน แบตเตอรี่ ทดสอบเดินเครื่อง 30 นาที และระบบ ATS'),
        ('HOT', 'annual', 14, 'ตรวจถังน้ำร้อนประจำปี', 'ล้างตะกรัน ตรวจ anode วาล์วนิรภัย และทดสอบอุณหภูมิ'),
    ]
    for index, (code, frequency, days, title, procedure) in enumerate(plans):
        plan, _ = PreventiveMaintenance.objects.get_or_create(
            pm_id=f'DEMOCTPMM{index + 1:03d}',
            defaults={
                'pmtitle': f'[DEMO] {title}', 'scheduled_date': now + timedelta(days=days),
                'next_due_date': now + timedelta(days=days), 'frequency': frequency,
                'status': 'pending', 'priority': 'high' if days < 0 else 'medium',
                'procedure': procedure, 'estimated_duration': 60,
                'created_by': technicians[0], 'assigned_to': technicians[index % len(technicians)],
            },
        )
        machines[code].preventive_maintenances.add(plan)

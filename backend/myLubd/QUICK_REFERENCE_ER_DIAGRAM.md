# Quick Reference - ER Diagram Implementation

## 🎯 Quick Start Commands

```bash
# 1. Apply migration
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate

# 2. Create Fire Pump equipment with tasks
python3 src/manage.py populate_fire_pump_v2 --property-id P12345678

# 3. With schedules included
python3 src/manage.py populate_fire_pump_v2 --property-id P12345678 --create-schedule
```

## 📊 ER Diagram Summary

```
Equipment (Machine)
    ↓ has many
MaintenanceTask (MaintenanceProcedure)
    ↓ schedules
MaintenanceSchedule (PreventiveMaintenance)
    ↓ assigned to
User
```

## 📋 Model Fields Quick Reference

### Equipment (Machine)
```python
# ER Diagram Fields
id, name, brand✨, category✨, serial_number✨, location,
installation_date, created_at, updated_at

# Additional Fields
machine_id, description, status, property, last_maintenance_date
```

### MaintenanceTask (MaintenanceProcedure)
```python
# ER Diagram Fields
id, equipment_id✨, frequency✨, estimated_duration✨,
description, responsible_department✨

# Additional Fields
name, steps, required_tools, safety_notes, difficulty_level,
created_at, updated_at
```

### MaintenanceSchedule (PreventiveMaintenance)
```python
# ER Diagram Fields
id, task_id (procedure_template), scheduled_date, completed_date,
status, assigned_to✨, remarks✨

# Additional Fields
pm_id, pmtitle, frequency, priority, before_image, after_image,
notes, created_by, updated_at
```

## 🔗 Relationships

### Forward (Equipment → Task → Schedule)
```python
# Equipment to Tasks
equipment.maintenance_tasks.all()

# Task to Schedules
task.maintenance_schedules.all()

# Schedule to User
schedule.assigned_to
```

### Reverse (Schedule → Task → Equipment)
```python
# Schedule to Task
schedule.procedure_template

# Task to Equipment
task.equipment

# User to Schedules
user.assigned_maintenance_schedules.all()
```

## 💻 Quick Code Snippets

### Create Equipment
```python
from myappLubd.models import Machine
equipment = Machine.objects.create(
    name='Fire Pump',
    brand='Grundfos',
    category='Fire Protection',
    serial_number='FP-001',
    location='Pump Room',
    property=property_obj
)
```

### Create Task
```python
from myappLubd.models import MaintenanceProcedure
task = MaintenanceProcedure.objects.create(
    equipment=equipment,
    name='Weekly Test',
    frequency='weekly',
    estimated_duration='5 mins',
    responsible_department='Engineering'
)
```

### Create Schedule
```python
from myappLubd.models import PreventiveMaintenance
schedule = PreventiveMaintenance.objects.create(
    procedure_template=task,
    pmtitle='Weekly Test',
    scheduled_date=timezone.now(),
    assigned_to=user,
    remarks='Standard test',
    created_by=user
)
```

## 🔍 Common Queries

```python
# Get equipment with brand
Machine.objects.filter(brand='Grundfos')

# Get weekly tasks
MaintenanceProcedure.objects.filter(frequency='weekly')

# Get Engineering tasks
MaintenanceProcedure.objects.filter(responsible_department='Engineering')

# Get user's schedules
user.assigned_maintenance_schedules.filter(status='pending')

# Get equipment by category
Machine.objects.filter(category='Fire Protection System')

# Get overdue schedules
PreventiveMaintenance.objects.filter(
    scheduled_date__lt=timezone.now(),
    status='pending'
)
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/machines/` | List equipment |
| POST | `/api/v1/machines/` | Create equipment |
| GET | `/api/v1/machines/{id}/` | Get equipment details with tasks |
| GET | `/api/v1/maintenance-procedures/` | List tasks |
| POST | `/api/v1/maintenance-procedures/` | Create task |
| GET | `/api/v1/preventive-maintenances/` | List schedules |
| POST | `/api/v1/preventive-maintenances/` | Create schedule |

## 📝 API Request Examples

### Create Equipment
```json
POST /api/v1/machines/
{
  "name": "Fire Pump",
  "brand": "Grundfos",
  "category": "Fire Protection",
  "serial_number": "FP-001",
  "location": "Pump Room",
  "property": 1
}
```

### Create Task
```json
POST /api/v1/maintenance-procedures/
{
  "equipment_id": 1,
  "name": "Weekly Test",
  "frequency": "weekly",
  "estimated_duration": "5 mins",
  "responsible_department": "Engineering"
}
```

### Create Schedule
```json
POST /api/v1/preventive-maintenances/
{
  "procedure_template": 1,
  "pmtitle": "Weekly Test",
  "scheduled_date": "2025-11-22T10:00:00Z",
  "assigned_to": 5,
  "remarks": "Standard test"
}
```

## 📁 File Structure

```
backend/myLubd/
├── src/myappLubd/
│   ├── models.py                  ✅ Updated
│   ├── admin.py                   ✅ Updated
│   ├── serializers.py             ✅ Updated
│   ├── migrations/
│   │   └── 0028_*.py             ✅ New migration
│   └── management/commands/
│       ├── populate_fire_pump_v2.py  ✅ New
│       └── import_equipment_csv.py
│
├── ER_DIAGRAM_IMPLEMENTATION.md  ✅ Technical details
├── ER_DIAGRAM_USAGE_GUIDE.md     ✅ Complete examples
└── QUICK_REFERENCE_ER_DIAGRAM.md ✅ This file
```

## ✨ New Fields Summary

| Model | New Fields |
|-------|------------|
| Equipment | `brand`, `category`, `serial_number` |
| MaintenanceTask | `equipment` (FK), `frequency`, `responsible_department` |
| MaintenanceSchedule | `assigned_to` (FK), `remarks` |

## 🎓 Key Differences from Old Structure

| Old | New |
|-----|-----|
| Machine ↔ MaintenanceProcedure (M2M) | Machine → MaintenanceProcedure (1-to-Many) |
| No brand/category/serial | Has brand/category/serial ✨ |
| No responsible_department | Has responsible_department ✨ |
| No assigned_to on schedule | Has assigned_to ✨ |
| No frequency on task | Has frequency ✨ |

## 🚀 Migration Status

- [x] Models updated
- [x] Admin updated  
- [x] Serializers updated
- [x] Migration created
- [x] Populate script created
- [x] Documentation complete

**Ready to use!** Run migration and start creating data.

## 📚 Documentation Files

- **Technical**: `ER_DIAGRAM_IMPLEMENTATION.md`
- **Complete Guide**: `ER_DIAGRAM_USAGE_GUIDE.md`
- **Quick Reference**: This file
- **Fire Pump**: `FIRE_PUMP_SETUP_GUIDE.md` (old structure)

---

**Start here:** `python3 src/manage.py migrate`


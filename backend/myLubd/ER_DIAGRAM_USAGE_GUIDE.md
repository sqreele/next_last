# ER Diagram Usage Guide

## 🚀 Complete Setup & Usage Examples

### Step 1: Apply Migration

```bash
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate
```

### Step 2: Create Fire Pump Data (New Command)

```bash
# Basic usage
python3 src/manage.py populate_fire_pump_v2 --property-id P12345678

# With maintenance schedules
python3 src/manage.py populate_fire_pump_v2 --property-id P12345678 --create-schedule
```

## 📊 ER Diagram Structure in Action

```
Equipment (Machine)
    ├── id: 1
    ├── name: "Electric Fire Pump"
    ├── brand: "Grundfos"  ✨ NEW
    ├── category: "Fire Protection System"  ✨ NEW
    ├── serial_number: "FP-2024-001"  ✨ NEW
    └── Has MaintenanceTasks ─┐
                              │
MaintenanceTask (MaintenanceProcedure)
    ├── id: 1
    ├── equipment_id: 1  ✨ FK (ER diagram)
    ├── name: "Weekly Fire Pump Testing"
    ├── frequency: "weekly"  ✨ NEW
    ├── estimated_duration: "5 mins"  ✨ TEXT
    ├── responsible_department: "Engineering"  ✨ NEW
    └── Has MaintenanceSchedules ─┐
                                  │
MaintenanceSchedule (PreventiveMaintenance)
    ├── id: 1
    ├── task_id: 1  (procedure_template)
    ├── scheduled_date: "2025-11-15"
    ├── status: "pending"
    ├── assigned_to: User(id=5)  ✨ NEW
    └── remarks: "Standard weekly test"  ✨ NEW
```

## 💻 Django ORM Examples

### Create Equipment with Tasks

```python
from django.utils import timezone
from myappLubd.models import Machine, MaintenanceProcedure, Property

# Get property
property_obj = Property.objects.first()

# Create Equipment
equipment = Machine.objects.create(
    name='Electric Fire Pump',
    brand='Grundfos',  # ER diagram field
    category='Fire Protection System',  # ER diagram field
    serial_number='FP-2024-001',  # ER diagram field (unique)
    location='Fire Pump Room',
    status='active',
    property=property_obj,
    installation_date=timezone.now().date()
)

print(f"✓ Created: {equipment.name} ({equipment.machine_id})")
print(f"  Brand: {equipment.brand}")
print(f"  Category: {equipment.category}")
print(f"  Serial: {equipment.serial_number}")

# Create MaintenanceTask for this Equipment
task = MaintenanceProcedure.objects.create(
    equipment=equipment,  # FK relationship (ER diagram)
    name='Weekly Fire Pump Testing',
    frequency='weekly',  # ER diagram field
    estimated_duration='5 mins',  # Text field (ER diagram)
    responsible_department='Engineering',  # ER diagram field
    description='Start and observe running. Open test valve.',
    difficulty_level='beginner',
    steps=[
        {
            'title': 'Start Pump',
            'description': 'Start and observe operation',
            'estimated_time': 5
        }
    ]
)

print(f"✓ Created task: {task.name}")
print(f"  Equipment: {task.equipment.name}")
print(f"  Frequency: {task.frequency}")
print(f"  Duration: {task.estimated_duration}")
print(f"  Department: {task.responsible_department}")
```

### Create Maintenance Schedule with User Assignment

```python
from myappLubd.models import PreventiveMaintenance
from django.contrib.auth import get_user_model

User = get_user_model()

# Get a user (engineer)
engineer = User.objects.filter(username='john.engineer').first()

# Create MaintenanceSchedule
schedule = PreventiveMaintenance.objects.create(
    procedure_template=task,  # task_id (ER diagram)
    pmtitle='Weekly Fire Pump Test - Nov 15',
    scheduled_date=timezone.now() + timezone.timedelta(days=7),
    status='pending',
    assigned_to=engineer,  # ER diagram field (FK to User)
    remarks='Standard weekly test per Narai Group standards',  # ER diagram field
    priority='high',
    created_by=engineer
)

print(f"✓ Created schedule: {schedule.pm_id}")
print(f"  Task: {schedule.procedure_template.name}")
print(f"  Assigned to: {schedule.assigned_to.username}")
print(f"  Scheduled: {schedule.scheduled_date}")
print(f"  Remarks: {schedule.remarks}")
```

### Query Equipment → Tasks → Schedules

```python
# Get equipment and all its tasks
equipment = Machine.objects.get(serial_number='FP-2024-001')
tasks = equipment.maintenance_tasks.all()

print(f"Equipment: {equipment.name}")
print(f"Tasks: {tasks.count()}")

for task in tasks:
    print(f"\n  Task: {task.name}")
    print(f"  Frequency: {task.frequency}")
    print(f"  Department: {task.responsible_department}")
    
    # Get schedules for this task
    schedules = task.maintenance_schedules.all()
    print(f"  Schedules: {schedules.count()}")
    
    for schedule in schedules:
        print(f"    - {schedule.pmtitle}")
        print(f"      Assigned: {schedule.assigned_to.username if schedule.assigned_to else 'Unassigned'}")
        print(f"      Status: {schedule.status}")
```

### Query User's Assigned Schedules

```python
from django.contrib.auth import get_user_model

User = get_user_model()
engineer = User.objects.get(username='john.engineer')

# Get all schedules assigned to this user
assigned_schedules = engineer.assigned_maintenance_schedules.all()

print(f"User: {engineer.username}")
print(f"Assigned Schedules: {assigned_schedules.count()}")

for schedule in assigned_schedules:
    print(f"\n  Schedule: {schedule.pmtitle}")
    print(f"  Equipment: {schedule.procedure_template.equipment.name}")
    print(f"  Frequency: {schedule.procedure_template.frequency}")
    print(f"  Due: {schedule.scheduled_date}")
    print(f"  Status: {schedule.status}")
```

### Filter by Category & Brand

```python
# Get all fire protection equipment
fire_equipment = Machine.objects.filter(category='Fire Protection System')

print(f"Fire Protection Equipment: {fire_equipment.count()}")
for equip in fire_equipment:
    print(f"  - {equip.name} (Brand: {equip.brand})")

# Get all Grundfos equipment
grundfos_equipment = Machine.objects.filter(brand='Grundfos')

print(f"\nGrundfos Equipment: {grundfos_equipment.count()}")

# Get equipment with weekly tasks
weekly_equipment = Machine.objects.filter(
    maintenance_tasks__frequency='weekly'
).distinct()

print(f"\nEquipment with Weekly Tasks: {weekly_equipment.count()}")
```

### Get Overdue Schedules by Department

```python
from django.utils import timezone

# Get overdue schedules for Engineering department
overdue = PreventiveMaintenance.objects.filter(
    scheduled_date__lt=timezone.now(),
    status='pending',
    procedure_template__responsible_department='Engineering'
).select_related(
    'procedure_template',
    'procedure_template__equipment',
    'assigned_to'
)

print(f"Overdue Engineering Tasks: {overdue.count()}")

for schedule in overdue:
    task = schedule.procedure_template
    equipment = task.equipment
    days_overdue = (timezone.now() - schedule.scheduled_date).days
    
    print(f"\n  {equipment.name} - {task.name}")
    print(f"  Days Overdue: {days_overdue}")
    print(f"  Assigned: {schedule.assigned_to.username if schedule.assigned_to else 'Unassigned'}")
    print(f"  Frequency: {task.frequency}")
```

## 🔌 API Examples

### GET Equipment with Tasks

```bash
curl http://localhost:8000/api/v1/machines/1/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "id": 1,
  "machine_id": "M25XXXXXXXX",
  "name": "Electric Fire Pump",
  "brand": "Grundfos",
  "category": "Fire Protection System",
  "serial_number": "FP-2024-001",
  "description": "Critical life safety equipment...",
  "location": "Fire Pump Room",
  "status": "active",
  "property": 1,
  "property_name": "Main Building",
  "installation_date": "2024-01-15",
  "maintenance_tasks": [
    {
      "id": 1,
      "name": "Weekly Fire Pump Testing",
      "frequency": "weekly",
      "estimated_duration": "5 mins",
      "responsible_department": "Engineering",
      "difficulty_level": "beginner",
      "steps_count": 5
    },
    {
      "id": 2,
      "name": "Annual Fire Pump Flow Test",
      "frequency": "annual",
      "estimated_duration": "2 hours",
      "responsible_department": "MEP Contractor",
      "difficulty_level": "advanced",
      "steps_count": 7
    }
  ],
  "task_count": 2,
  "created_at": "2025-01-15T10:00:00Z"
}
```

### POST Create Equipment

```bash
curl -X POST http://localhost:8000/api/v1/machines/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HVAC Chiller #1",
    "brand": "Carrier",
    "category": "HVAC System",
    "serial_number": "HVAC-2024-001",
    "location": "Rooftop",
    "status": "active",
    "property": 1,
    "installation_date": "2024-01-20"
  }'
```

### POST Create MaintenanceTask

```bash
curl -X POST http://localhost:8000/api/v1/maintenance-procedures/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "equipment_id": 1,
    "name": "Monthly HVAC Check",
    "frequency": "monthly",
    "estimated_duration": "1 hour",
    "responsible_department": "Engineering",
    "description": "Check refrigerant and clean coils",
    "difficulty_level": "intermediate",
    "steps": [
      {
        "title": "Check Refrigerant",
        "description": "Measure refrigerant levels",
        "estimated_time": 30
      },
      {
        "title": "Clean Coils",
        "description": "Remove debris from coils",
        "estimated_time": 30
      }
    ]
  }'
```

### POST Create MaintenanceSchedule with Assignment

```bash
curl -X POST http://localhost:8000/api/v1/preventive-maintenances/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "procedure_template": 1,
    "pmtitle": "Weekly Fire Pump Test - Nov 22",
    "scheduled_date": "2025-11-22T10:00:00Z",
    "status": "pending",
    "priority": "high",
    "assigned_to": 5,
    "remarks": "Standard weekly test - Engineering team",
    "frequency": "weekly"
  }'
```

### GET Schedules by User

```bash
curl "http://localhost:8000/api/v1/preventive-maintenances/?assigned_to=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📊 Advanced Queries

### Equipment Age Report

```python
from django.db.models import F
from django.utils import timezone
from datetime import timedelta

# Get equipment older than 5 years
five_years_ago = timezone.now().date() - timedelta(days=1825)
old_equipment = Machine.objects.filter(
    installation_date__lt=five_years_ago
).order_by('installation_date')

print("Equipment Older Than 5 Years:")
for equip in old_equipment:
    age_days = (timezone.now().date() - equip.installation_date).days
    age_years = age_days / 365.25
    print(f"  {equip.name} ({equip.brand})")
    print(f"    Age: {age_years:.1f} years")
    print(f"    Category: {equip.category}")
    print(f"    Serial: {equip.serial_number}")
```

### Department Workload

```python
from django.db.models import Count

# Get task count per department
dept_workload = MaintenanceProcedure.objects.values(
    'responsible_department'
).annotate(
    task_count=Count('id'),
    schedule_count=Count('maintenance_schedules')
).order_by('-task_count')

print("Department Workload:")
for dept in dept_workload:
    print(f"\n  {dept['responsible_department']}")
    print(f"    Tasks: {dept['task_count']}")
    print(f"    Schedules: {dept['schedule_count']}")
```

### Frequency Analysis

```python
from django.db.models import Count

# Get equipment count by task frequency
frequency_stats = MaintenanceProcedure.objects.values(
    'frequency'
).annotate(
    count=Count('id'),
    equipment_count=Count('equipment', distinct=True)
).order_by('-count')

print("Task Frequency Distribution:")
for stat in frequency_stats:
    print(f"\n  {stat['frequency'].title()}:")
    print(f"    Tasks: {stat['count']}")
    print(f"    Equipment: {stat['equipment_count']}")
```

### User Assignment Report

```python
from django.db.models import Count
from django.contrib.auth import get_user_model

User = get_user_model()

# Get users with schedule counts
user_stats = User.objects.annotate(
    pending_count=Count(
        'assigned_maintenance_schedules',
        filter=Q(assigned_maintenance_schedules__status='pending')
    ),
    completed_count=Count(
        'assigned_maintenance_schedules',
        filter=Q(assigned_maintenance_schedules__status='completed')
    )
).filter(
    Q(pending_count__gt=0) | Q(completed_count__gt=0)
).order_by('-pending_count')

print("User Assignment Report:")
for user in user_stats:
    print(f"\n  {user.username} ({user.get_full_name()})")
    print(f"    Pending: {user.pending_count}")
    print(f"    Completed: {user.completed_count}")
```

## 🎯 Common Use Cases

### 1. Create Equipment Type Template

```python
def create_equipment_with_standard_tasks(
    name, brand, category, serial_number, location, property_obj
):
    """Create equipment with standard maintenance tasks"""
    
    # Create equipment
    equipment = Machine.objects.create(
        name=name,
        brand=brand,
        category=category,
        serial_number=serial_number,
        location=location,
        property=property_obj,
        status='active',
        installation_date=timezone.now().date()
    )
    
    # Standard tasks based on category
    if category == 'Fire Protection System':
        MaintenanceProcedure.objects.create(
            equipment=equipment,
            name='Weekly Testing',
            frequency='weekly',
            estimated_duration='5 mins',
            responsible_department='Engineering',
            difficulty_level='beginner'
        )
        MaintenanceProcedure.objects.create(
            equipment=equipment,
            name='Annual Flow Test',
            frequency='annual',
            estimated_duration='2 hours',
            responsible_department='MEP Contractor',
            difficulty_level='advanced'
        )
    
    return equipment
```

### 2. Assign Schedules to Team

```python
def assign_weekly_schedules_to_team(department='Engineering'):
    """Assign all pending weekly schedules to engineering team"""
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    # Get engineering team users
    engineers = User.objects.filter(
        userprofile__positions__icontains=department
    )
    
    if not engineers.exists():
        print("No engineers found")
        return
    
    # Get unassigned weekly schedules
    unassigned = PreventiveMaintenance.objects.filter(
        procedure_template__frequency='weekly',
        procedure_template__responsible_department=department,
        assigned_to__isnull=True,
        status='pending'
    )
    
    # Round-robin assignment
    for idx, schedule in enumerate(unassigned):
        engineer = engineers[idx % engineers.count()]
        schedule.assigned_to = engineer
        schedule.save()
        print(f"Assigned {schedule.pmtitle} to {engineer.username}")
```

### 3. Generate Monthly Report

```python
def generate_monthly_maintenance_report(year, month):
    """Generate maintenance report for a specific month"""
    
    from django.db.models import Q
    from calendar import monthrange
    
    # Get date range
    start_date = timezone.datetime(year, month, 1)
    last_day = monthrange(year, month)[1]
    end_date = timezone.datetime(year, month, last_day, 23, 59, 59)
    
    # Get schedules for the month
    schedules = PreventiveMaintenance.objects.filter(
        Q(scheduled_date__range=[start_date, end_date]) |
        Q(completed_date__range=[start_date, end_date])
    ).select_related(
        'procedure_template',
        'procedure_template__equipment',
        'assigned_to'
    )
    
    report = {
        'total': schedules.count(),
        'completed': schedules.filter(status='completed').count(),
        'pending': schedules.filter(status='pending').count(),
        'overdue': schedules.filter(
            status='pending',
            scheduled_date__lt=timezone.now()
        ).count(),
        'by_department': {},
        'by_equipment_category': {}
    }
    
    # Group by department
    for schedule in schedules:
        dept = schedule.procedure_template.responsible_department
        if dept not in report['by_department']:
            report['by_department'][dept] = {
                'total': 0,
                'completed': 0
            }
        report['by_department'][dept]['total'] += 1
        if schedule.status == 'completed':
            report['by_department'][dept]['completed'] += 1
    
    # Group by equipment category
    for schedule in schedules:
        category = schedule.procedure_template.equipment.category
        if category not in report['by_equipment_category']:
            report['by_equipment_category'][category] = {
                'total': 0,
                'completed': 0
            }
        report['by_equipment_category'][category]['total'] += 1
        if schedule.status == 'completed':
            report['by_equipment_category'][category]['completed'] += 1
    
    return report
```

---

## ✅ Complete ER Diagram Implementation

All relationships are working:
- Equipment ||--o{ MaintenanceTask ✓
- MaintenanceTask ||--o{ MaintenanceSchedule ✓
- User ||--o{ MaintenanceSchedule ✓

Start using: `python3 src/manage.py populate_fire_pump_v2 --property-id YOUR_PROPERTY_ID --create-schedule`


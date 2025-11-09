# Electric Fire Pump Setup Guide - Narai Group Standard

## 🔥 Quick Setup

### Step 1: Apply Migration
```bash
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate
```

### Step 2: Create Fire Pump Data
```bash
# Replace P12345678 with your actual Property ID
python3 src/manage.py populate_fire_pump --property-id P12345678
```

### Step 3: Verify
```bash
# Check in Django shell
python3 src/manage.py shell -c "
from myappLubd.models import Machine
fp = Machine.objects.filter(name='Electric Fire Pump').first()
if fp:
    print(f'✓ {fp.name} created: {fp.machine_id}')
    print(f'  Procedures: {fp.maintenance_procedures.count()}')
    for proc in fp.maintenance_procedures.all():
        print(f'    - {proc.name}')
"
```

## 📋 What Gets Created

### Equipment
- **Name**: Electric Fire Pump
- **Standard**: Narai Group
- **Status**: Active
- **Location**: Fire Pump Room / Mechanical Room

### Procedure 1: Weekly Testing (5 minutes)
- **Frequency**: Weekly
- **Responsibility**: Engineering Department
- **Difficulty**: Beginner
- **Steps**:
  1. Pre-Start Safety Check (1 min)
  2. Start Fire Pump (1 min)
  3. Open Test Valve (2 min)
  4. Observe Running Operation (2 min)
  5. Shutdown and Document (1 min)

### Procedure 2: Annual Flow Test (2 hours)
- **Frequency**: Yearly
- **Responsibility**: MEP Contractor (Licensed)
- **Difficulty**: Advanced
- **Steps**:
  1. Pre-Test Preparation and Notifications (20 min)
  2. Install Flow Test Equipment (30 min)
  3. Conduct No-Flow Pressure Test (10 min)
  4. Conduct Rated Flow Test (20 min)
  5. Conduct 150% Flow Test (15 min)
  6. Shutdown and Equipment Removal (20 min)
  7. Analysis and Documentation (30 min)

## 🔍 Find Your Property ID

If you don't know your Property ID:

```bash
python3 src/manage.py shell -c "
from myappLubd.models import Property
print('Available Properties:')
for p in Property.objects.all():
    print(f'  {p.property_id}: {p.name}')
"
```

Or check in Django Admin:
- Navigate to `/admin/myappLubd/property/`
- Find your property and note the `property_id`

## 📊 View in Django Admin

After creation:
1. Go to `/admin/myappLubd/machine/`
2. Find "Electric Fire Pump"
3. Click to view details
4. See linked procedures in "Property & Maintenance" section

## 🔌 Access via API

### Get Fire Pump Details
```bash
curl http://localhost:8000/api/v1/machines/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.results[] | select(.name=="Electric Fire Pump")'
```

### Get Fire Pump with Procedures
```bash
# Get the machine ID from above, then:
curl http://localhost:8000/api/v1/machines/{id}/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response includes:
```json
{
  "id": 1,
  "machine_id": "M25XXXXX",
  "name": "Electric Fire Pump",
  "description": "Electric fire pump system - Narai Group Standard...",
  "location": "Fire Pump Room / Mechanical Room",
  "status": "active",
  "maintenance_procedures": [
    {
      "id": 1,
      "name": "Weekly Fire Pump Testing - Narai Group Standard",
      "difficulty_level": "beginner",
      "estimated_duration": 5,
      "steps_count": 5
    },
    {
      "id": 2,
      "name": "Annual Fire Pump Flow Test - Narai Group Standard",
      "difficulty_level": "advanced",
      "estimated_duration": 120,
      "steps_count": 7
    }
  ]
}
```

## 📝 Create Preventive Maintenance Schedule

Once the fire pump is created, you can create scheduled maintenance:

```bash
python3 src/manage.py shell
```

```python
from django.utils import timezone
from myappLubd.models import Machine, PreventiveMaintenance
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()  # or get specific user

# Get the fire pump
fire_pump = Machine.objects.get(name='Electric Fire Pump')

# Get the weekly procedure
weekly_proc = fire_pump.maintenance_procedures.get(
    name__contains='Weekly'
)

# Create weekly preventive maintenance
pm_weekly = PreventiveMaintenance.objects.create(
    pmtitle='Electric Fire Pump - Weekly Test',
    scheduled_date=timezone.now() + timezone.timedelta(days=7),
    frequency='weekly',
    procedure_template=weekly_proc,
    procedure=f"{weekly_proc.name}\n\nSteps:\n" + "\n".join(
        f"{s['step_number']}. {s['title']}: {s['description']}"
        for s in weekly_proc.steps
    ),
    estimated_duration=weekly_proc.estimated_duration,
    priority='high',
    status='pending',
    created_by=user
)

print(f"✓ Created: {pm_weekly.pm_id}")
```

## 📑 Maintenance Checklist

The procedures include detailed steps. You can create a checklist:

```python
from myappLubd.models import MaintenanceChecklist

# Get the preventive maintenance task
pm = PreventiveMaintenance.objects.get(pm_id='pm25XXXXX')

# Get the procedure
procedure = pm.procedure_template

# Create checklist items from procedure steps
for step in procedure.steps:
    MaintenanceChecklist.objects.create(
        maintenance=pm,
        item=step['title'],
        description=step['description'],
        order=step['step_number']
    )

print(f"✓ Created {procedure.get_steps_count()} checklist items")
```

## 🎯 Compliance & Standards

### Narai Group Standard Requirements
- ✅ Weekly testing (5 minutes)
- ✅ Yearly flow test by licensed contractor
- ✅ Detailed documentation
- ✅ Safety procedures

### NFPA 25 Compliance
The annual flow test procedure follows:
- Static pressure test
- Rated flow test (100%)
- Peak flow test (150%)
- Documentation requirements

### Responsibility Matrix
| Task | Frequency | Responsibility | Skill Level |
|------|-----------|----------------|-------------|
| Weekly Testing | Weekly | Engineering | Beginner |
| Annual Flow Test | Yearly | MEP Contractor | Advanced |

## 🔄 Add More Equipment

### Method 1: Use CSV Template
See `equipment_template.csv` for bulk import format

### Method 2: Create Custom Command
Copy `populate_fire_pump.py` and modify for your equipment

### Method 3: Django Admin
Manually add via admin interface

### Method 4: API
Use POST endpoints to create machines and procedures

## 📞 Troubleshooting

### "Property not found"
```bash
# List all properties
python3 src/manage.py shell -c "
from myappLubd.models import Property
for p in Property.objects.all():
    print(f'{p.property_id}: {p.name}')
"
```

### "Fire Pump already exists"
The command is safe to run multiple times. It will:
- Skip if equipment already exists
- Skip if procedures already exist
- Link them if not already linked

### Update Existing Fire Pump
```bash
python3 src/manage.py shell
```

```python
from myappLubd.models import Machine

# Find and update
fp = Machine.objects.get(name='Electric Fire Pump')
fp.description = 'Updated description...'
fp.location = 'New Location'
fp.save()
```

## 📚 Next Steps

1. ✅ Create Fire Pump equipment
2. 📅 Schedule weekly preventive maintenance
3. 📅 Schedule annual flow test
4. 👥 Assign to Engineering team
5. 📊 Track completion in admin/API

## 🎓 Training Materials

### For Engineering Team (Weekly Test)
- Duration: 5 minutes
- Frequency: Weekly
- Access procedure at: `/api/v1/maintenance-procedures/` (filter by name)
- Print checklist from procedure steps

### For MEP Contractor (Annual Test)
- Duration: 2 hours
- Frequency: Yearly
- Requires: Licensed contractor, calibrated equipment
- Full procedure with safety notes available in system

---

**Ready to Deploy!** 🚀

Run the command and start tracking your fire pump maintenance with Narai Group standards.


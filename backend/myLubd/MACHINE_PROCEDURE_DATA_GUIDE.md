# Machine & Procedure Data Population Guide

## Quick Start

### Method 1: Management Command (Recommended)

The management command creates realistic test data with proper relationships.

#### 1. Apply the migration first
```bash
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate
```

#### 2. Run the populate command
```bash
# Basic usage (creates test property if needed)
python3 src/manage.py populate_machine_procedures

# Use an existing property
python3 src/manage.py populate_machine_procedures --property-id P12345678

# Clear existing data and recreate
python3 src/manage.py populate_machine_procedures --clear
```

#### What Gets Created:
- **7 Maintenance Procedures**:
  - Daily Safety Inspection (beginner) - 15 min
  - Weekly Pump Maintenance (intermediate) - 60 min
  - Monthly HVAC System Check (intermediate) - 90 min
  - Quarterly Compressor Overhaul (advanced) - 180 min
  - Annual Boiler Inspection (expert) - 240 min
  - Conveyor Belt Maintenance (intermediate) - 45 min

- **10 Machines**:
  - 2x Industrial Pumps
  - 2x HVAC Units
  - 2x Air Compressors
  - 1x Boiler System
  - 3x Conveyor Systems

- **Relationships**: Each machine is linked to relevant procedures

### Method 2: Django Admin

1. Navigate to `/admin/`
2. Go to **Maintenance > Maintenance Procedures**
3. Click "Add maintenance procedure"
4. Fill in the fields and select machines using the filter widget
5. Save

### Method 3: API (Manual Creation)

#### Create a Procedure
```bash
curl -X POST http://localhost:8000/api/v1/maintenance-procedures/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Pump Check",
    "description": "Weekly maintenance for industrial pumps",
    "difficulty_level": "intermediate",
    "estimated_duration": 60,
    "required_tools": "Wrench set, lubricant, pressure gauge",
    "safety_notes": "Lock out pump before starting",
    "steps": [
      {
        "title": "Safety Check",
        "description": "Verify lockout/tagout is in place",
        "estimated_time": 10,
        "required_tools": ["lockout_kit"],
        "safety_warnings": ["Verify zero energy state"]
      },
      {
        "title": "Lubrication",
        "description": "Check and refill lubricant",
        "estimated_time": 20,
        "required_tools": ["lubricant", "wrench"]
      }
    ],
    "machine_ids": [1, 2, 3]
  }'
```

#### Create a Machine with Procedures
```bash
curl -X POST http://localhost:8000/api/v1/machines/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Industrial Pump #1",
    "description": "Main water circulation pump",
    "location": "Building A - Mechanical Room",
    "property": 1,
    "status": "active",
    "procedure_ids": [1, 2]
  }'
```

### Method 4: Django Shell

```bash
python3 src/manage.py shell
```

```python
from django.utils import timezone
from myappLubd.models import Machine, MaintenanceProcedure, Property

# Get or create property
property_obj = Property.objects.first()

# Create a procedure
procedure = MaintenanceProcedure.objects.create(
    name="Daily Equipment Check",
    description="Quick daily inspection routine",
    difficulty_level="beginner",
    estimated_duration=15,
    required_tools="Flashlight, checklist",
    safety_notes="Visual inspection only",
    steps=[
        {
            "title": "Visual Inspection",
            "description": "Check for visible issues",
            "estimated_time": 10,
            "required_tools": ["flashlight"]
        }
    ]
)

# Create a machine
machine = Machine.objects.create(
    name="Test Machine #1",
    description="Test equipment",
    location="Test Location",
    property=property_obj,
    status="active"
)

# Link them together
machine.maintenance_procedures.add(procedure)

print(f"Created: {machine.name}")
print(f"Procedures: {machine.maintenance_procedures.count()}")
```

## Verify the Data

### Check in Django Admin
1. Go to `/admin/myappLubd/machine/`
2. Click on any machine
3. Scroll to "Property & Maintenance" section
4. You should see the procedures in the filter widget

### Check via API

```bash
# List all machines with procedure counts
curl http://localhost:8000/api/v1/machines/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific machine with procedures
curl http://localhost:8000/api/v1/machines/1/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# List all procedures with machine counts
curl http://localhost:8000/api/v1/maintenance-procedures/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check in Django Shell

```python
from myappLubd.models import Machine, MaintenanceProcedure

# Get a machine and its procedures
machine = Machine.objects.first()
print(f"Machine: {machine.name}")
print(f"Procedures: {machine.maintenance_procedures.count()}")

for proc in machine.maintenance_procedures.all():
    print(f"  - {proc.name} ({proc.difficulty_level})")

# Get a procedure and its machines
procedure = MaintenanceProcedure.objects.first()
print(f"\nProcedure: {procedure.name}")
print(f"Machines: {procedure.machines.count()}")

for machine in procedure.machines.all():
    print(f"  - {machine.name}")
```

## Sample Data Structure

The populate command creates this structure:

```
Property: Test Facility
├── Machines (10)
│   ├── Industrial Pump #1
│   │   ├── Daily Safety Inspection
│   │   └── Weekly Pump Maintenance
│   ├── Industrial Pump #2
│   │   ├── Daily Safety Inspection
│   │   └── Weekly Pump Maintenance
│   ├── HVAC Unit - North Wing
│   │   ├── Daily Safety Inspection
│   │   └── Monthly HVAC System Check
│   ├── HVAC Unit - South Wing
│   │   ├── Daily Safety Inspection
│   │   └── Monthly HVAC System Check
│   ├── Air Compressor #1
│   │   ├── Daily Safety Inspection
│   │   └── Quarterly Compressor Overhaul
│   ├── Air Compressor #2
│   │   └── Quarterly Compressor Overhaul
│   ├── Boiler System
│   │   ├── Daily Safety Inspection
│   │   └── Annual Boiler Inspection
│   ├── Production Conveyor Line 1
│   │   ├── Daily Safety Inspection
│   │   └── Conveyor Belt Maintenance
│   ├── Production Conveyor Line 2
│   │   ├── Daily Safety Inspection
│   │   └── Conveyor Belt Maintenance
│   └── Warehouse Conveyor
│       └── Conveyor Belt Maintenance
```

## Troubleshooting

### "Property not found"
```bash
# List available properties
python3 src/manage.py shell -c "from myappLubd.models import Property; print([(p.property_id, p.name) for p in Property.objects.all()])"

# Use the property_id in the command
python3 src/manage.py populate_machine_procedures --property-id P12345678
```

### "Migration not applied"
```bash
# Apply migrations first
python3 src/manage.py migrate
```

### "Command not found"
```bash
# Ensure the file structure is correct:
# src/myappLubd/management/commands/populate_machine_procedures.py

# Check if __init__.py files exist
ls -la src/myappLubd/management/
ls -la src/myappLubd/management/commands/
```

### View all available commands
```bash
python3 src/manage.py help
```

## Next Steps

After populating data:

1. **Test the API**: Use the examples above to fetch machines and procedures
2. **Check Django Admin**: Verify relationships in the admin interface
3. **Create Preventive Maintenance**: Link procedures to maintenance tasks
4. **Generate Reports**: Query machines by procedure or vice versa

## Clean Up

To remove test data:

```python
# Django shell
from myappLubd.models import Machine, MaintenanceProcedure

# Remove specific machines
Machine.objects.filter(name__contains='Test').delete()

# Remove specific procedures
MaintenanceProcedure.objects.filter(name__contains='Test').delete()

# Or use the command
python3 src/manage.py populate_machine_procedures --clear
```



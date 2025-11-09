# Machine ↔ Maintenance Procedure Relationship

## Overview
A direct many-to-many relationship has been added between **Machine** and **MaintenanceProcedure** models. This allows you to:
- Assign multiple procedures to a machine
- Track which machines use a specific procedure
- Query procedures by machine and vice versa

## Database Schema

### MaintenanceProcedure Model
- **machines** (ManyToManyField): Related machines that use this procedure
  - Related name: `maintenance_procedures`
  - Access from Machine: `machine.maintenance_procedures.all()`

### Machine Model  
- **maintenance_procedures** (reverse ManyToMany): Procedures assigned to this machine
  - Access: `machine.maintenance_procedures.all()`

## API Usage

### 1. Assign Procedures to a Machine

**POST/PUT** `/api/v1/machines/` or `/api/v1/machines/{id}/`

```json
{
  "name": "Industrial Pump #1",
  "description": "Main water circulation pump",
  "property": 1,
  "status": "active",
  "procedure_ids": [1, 2, 3]
}
```

### 2. Get Machine with Procedures

**GET** `/api/v1/machines/{id}/`

Response includes:
```json
{
  "id": 1,
  "machine_id": "M25A3B4C5D6",
  "name": "Industrial Pump #1",
  "maintenance_procedures": [
    {
      "id": 1,
      "name": "Monthly Pump Maintenance",
      "difficulty_level": "intermediate",
      "estimated_duration": 120,
      "steps_count": 8
    },
    {
      "id": 2,
      "name": "Quarterly Pump Inspection",
      "difficulty_level": "advanced",
      "estimated_duration": 180,
      "steps_count": 12
    }
  ],
  "procedure_ids": [1, 2],
  ...
}
```

### 3. Assign Machines to a Procedure

**POST/PUT** `/api/v1/maintenance-procedures/` or `/api/v1/maintenance-procedures/{id}/`

```json
{
  "name": "Monthly Pump Maintenance",
  "description": "Regular maintenance for industrial pumps",
  "difficulty_level": "intermediate",
  "estimated_duration": 120,
  "machine_ids": [1, 2, 3],
  "steps": [
    {
      "title": "Safety Check",
      "description": "Verify all safety equipment",
      "estimated_time": 10
    }
  ]
}
```

### 4. Get Procedure with Machine Count

**GET** `/api/v1/maintenance-procedures/`

Response includes:
```json
{
  "results": [
    {
      "id": 1,
      "name": "Monthly Pump Maintenance",
      "description": "Regular maintenance for industrial pumps",
      "steps_count": 8,
      "total_estimated_time": 125,
      "estimated_duration": 120,
      "difficulty_level": "intermediate",
      "machine_count": 3,
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

## Django ORM Usage

### Query Examples

```python
from myappLubd.models import Machine, MaintenanceProcedure

# Get all procedures for a machine
machine = Machine.objects.get(machine_id="M25A3B4C5D6")
procedures = machine.maintenance_procedures.all()

# Get all machines using a procedure
procedure = MaintenanceProcedure.objects.get(id=1)
machines = procedure.machines.all()

# Add a procedure to a machine
machine.maintenance_procedures.add(procedure)

# Remove a procedure from a machine
machine.maintenance_procedures.remove(procedure)

# Set procedures for a machine (replaces existing)
machine.maintenance_procedures.set([procedure1, procedure2, procedure3])

# Clear all procedures from a machine
machine.maintenance_procedures.clear()

# Check if machine has a specific procedure
has_procedure = machine.maintenance_procedures.filter(id=1).exists()

# Get machines with a specific difficulty level procedure
machines_with_advanced = Machine.objects.filter(
    maintenance_procedures__difficulty_level='advanced'
).distinct()

# Get procedures for machines in a specific property
procedures_for_property = MaintenanceProcedure.objects.filter(
    machines__property__property_id='P12345678'
).distinct()

# Count procedures per machine
from django.db.models import Count
machines_with_counts = Machine.objects.annotate(
    procedure_count=Count('maintenance_procedures')
)
```

## Django Admin

### Machine Admin
- Added **Procedures** column showing count
- Added **maintenance_procedures** to `filter_horizontal` for easy selection
- Shows procedures in the "Property & Maintenance" fieldset

### MaintenanceProcedure Admin
- Added **Machines** column showing count
- Added **machines** to `filter_horizontal` for easy selection
- New "Related Machines" fieldset for managing relationships
- Added **difficulty_level** to list display and filters

## Use Cases

### 1. Equipment-Specific Procedures
```python
# Assign pump-specific procedures to all pumps
pump_procedures = MaintenanceProcedure.objects.filter(
    name__icontains='pump'
)
pumps = Machine.objects.filter(name__icontains='pump')

for pump in pumps:
    pump.maintenance_procedures.set(pump_procedures)
```

### 2. Scheduled Maintenance
```python
# Create preventive maintenance tasks from machine procedures
machine = Machine.objects.get(machine_id="M25A3B4C5D6")

for procedure in machine.maintenance_procedures.all():
    pm = PreventiveMaintenance.objects.create(
        pmtitle=f"{machine.name} - {procedure.name}",
        scheduled_date=timezone.now() + timezone.timedelta(days=30),
        frequency="monthly",
        procedure_template=procedure,
        estimated_duration=procedure.estimated_duration,
        created_by=user
    )
```

### 3. Bulk Assignment
```python
# Assign a standard procedure to all machines in a property
property = Property.objects.get(property_id='P12345678')
machines = property.machines.all()
standard_procedure = MaintenanceProcedure.objects.get(name="Daily Safety Check")

for machine in machines:
    machine.maintenance_procedures.add(standard_procedure)
```

## Migration

The relationship was added in migration `0027_remove_job_myapplubd_j_status_c9b764_idx_and_more.py`

To apply the migration:
```bash
python manage.py migrate
```

## Related Models

```
Machine ←→ MaintenanceProcedure (Many-to-Many, NEW)
Machine ←→ PreventiveMaintenance (Many-to-Many, existing)
PreventiveMaintenance → MaintenanceProcedure (ForeignKey via procedure_template)
```

## Benefits

1. **Direct Linking**: Connect machines to their applicable procedures without creating maintenance tasks
2. **Template Library**: Build a library of procedures and assign them to relevant machines
3. **Reporting**: Track which machines use which procedures
4. **Compliance**: Ensure all machines have required maintenance procedures assigned
5. **Planning**: View all procedures for a machine to plan maintenance schedules



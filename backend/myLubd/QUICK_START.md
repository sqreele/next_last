# Quick Start: Machine-Procedure Relationship

## 🚀 Setup in 3 Steps

### Step 1: Apply Migration
```bash
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate
```

### Step 2: Insert Test Data
```bash
python3 src/manage.py populate_machine_procedures
```

### Step 3: Verify
```bash
# Django shell
python3 src/manage.py shell

# Then run:
from myappLubd.models import Machine, MaintenanceProcedure

print(f"Machines: {Machine.objects.count()}")
print(f"Procedures: {MaintenanceProcedure.objects.count()}")

# Show first machine with procedures
machine = Machine.objects.first()
if machine:
    print(f"\n{machine.name}:")
    for proc in machine.maintenance_procedures.all():
        print(f"  • {proc.name}")
```

## 📊 What You Get

- **10 Machines** (Pumps, HVAC, Compressors, Boilers, Conveyors)
- **7 Procedures** (From beginner to expert level)
- **Realistic relationships** (e.g., Pumps → Pump Maintenance)

## 🔗 Common Commands

### List all machines with procedures
```bash
python3 src/manage.py shell -c "
from myappLubd.models import Machine
for m in Machine.objects.all():
    print(f'{m.machine_id} - {m.name}: {m.maintenance_procedures.count()} procedures')
"
```

### List all procedures with machines
```bash
python3 src/manage.py shell -c "
from myappLubd.models import MaintenanceProcedure
for p in MaintenanceProcedure.objects.all():
    print(f'{p.name}: {p.machines.count()} machines')
"
```

### Add procedure to machine
```bash
python3 src/manage.py shell
```
```python
from myappLubd.models import Machine, MaintenanceProcedure

machine = Machine.objects.get(machine_id='M25...')
procedure = MaintenanceProcedure.objects.get(id=1)

machine.maintenance_procedures.add(procedure)
print("✓ Linked!")
```

## 🔄 Re-populate

```bash
# Clear and recreate all data
python3 src/manage.py populate_machine_procedures --clear

# Use existing property
python3 src/manage.py populate_machine_procedures --property-id P12345678
```

## 📱 API Endpoints

```bash
# List machines (requires auth token)
curl http://localhost:8000/api/v1/machines/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get machine details with procedures
curl http://localhost:8000/api/v1/machines/1/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# List procedures with machine counts
curl http://localhost:8000/api/v1/maintenance-procedures/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🎯 Next Steps

1. ✅ **Migration applied** - Database schema updated
2. ✅ **Data populated** - Sample machines and procedures created
3. 📋 **Check Admin** - Visit `/admin/myappLubd/machine/`
4. 🔌 **Test API** - Use the endpoints above
5. 📊 **Create Tasks** - Link procedures to preventive maintenance

## 📚 Full Documentation

- **Relationship Guide**: `MACHINE_PROCEDURE_RELATIONSHIP.md`
- **Data Population**: `MACHINE_PROCEDURE_DATA_GUIDE.md`
- **Procedure Examples**: `MAINTENANCE_PROCEDURE_EXAMPLES.md`

## ⚠️ Troubleshooting

### Database connection error?
The populate command will work once you run it with the database available. The migration file has been created and is ready to apply.

### Property not found?
```bash
# Create a property first in Django admin or:
python3 src/manage.py shell -c "
from myappLubd.models import Property
p = Property.objects.create(name='My Facility')
print(f'Created: {p.property_id}')
"
```

### Command not found?
Check file structure:
```bash
ls -la src/myappLubd/management/commands/populate_machine_procedures.py
```

## 💡 Quick Examples

### Get machines by procedure
```python
from myappLubd.models import MaintenanceProcedure

# Find all machines using "Daily Safety Inspection"
procedure = MaintenanceProcedure.objects.get(name__contains='Daily Safety')
machines = procedure.machines.all()
print(f"{machines.count()} machines use this procedure")
```

### Get procedures by difficulty
```python
from myappLubd.models import MaintenanceProcedure

# Get beginner-level procedures
easy = MaintenanceProcedure.objects.filter(difficulty_level='beginner')
print(f"Beginner procedures: {easy.count()}")

# Get expert-level procedures  
expert = MaintenanceProcedure.objects.filter(difficulty_level='expert')
print(f"Expert procedures: {expert.count()}")
```

### Filter machines by status
```python
from myappLubd.models import Machine

# Active machines
active = Machine.objects.filter(status='active')
print(f"Active machines: {active.count()}")

# Machines needing maintenance
maintenance = Machine.objects.filter(status='maintenance')
print(f"In maintenance: {maintenance.count()}")
```

---

**Ready to test!** 🎉 Run the migration and populate command to get started.



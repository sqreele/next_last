# Equipment & Procedure Import Commands Reference

## 🎯 Three Ways to Insert Data

### Method 1: Fire Pump Specific (Your Data) ⭐ RECOMMENDED
```bash
python3 src/manage.py populate_fire_pump --property-id P12345678
```

**What it creates:**
- ✅ Electric Fire Pump equipment
- ✅ Weekly Testing procedure (5 min) - Engineering
- ✅ Annual Flow Test procedure (2 hours) - MEP Contractor
- ✅ Narai Group standards compliance
- ✅ Full detailed steps with safety notes

### Method 2: Bulk CSV Import
```bash
# 1. Preview what will be created (dry run)
python3 src/manage.py import_equipment_csv equipment_template.csv --property-id P12345678 --dry-run

# 2. Actually create the data
python3 src/manage.py import_equipment_csv equipment_template.csv --property-id P12345678
```

**CSV Format** (`equipment_template.csv`):
```csv
Equipment,Standard,Frequency,Duration_Minutes,Procedure,Responsibility,Difficulty,Location,Status
Electric Fire Pump,Narai Group,Weekly,5,Start and observe running...,Engineering,beginner,Fire Pump Room,active
```

### Method 3: General Test Data
```bash
python3 src/manage.py populate_machine_procedures --property-id P12345678
```

**What it creates:**
- 7 sample procedures (pumps, HVAC, compressors, etc.)
- 10 sample machines
- Demo data for testing

## 📋 Complete Workflow

### Step 1: Migration
```bash
cd /home/sqreele/next_last/backend/myLubd
python3 src/manage.py migrate
```

### Step 2: Find Your Property ID
```bash
python3 src/manage.py shell -c "
from myappLubd.models import Property
for p in Property.objects.all():
    print(f'{p.property_id}: {p.name}')
"
```

Example output:
```
P1A2B3C4D: Main Building
P5E6F7G8H: North Wing
```

### Step 3: Choose Your Import Method

#### Option A: Just Fire Pump (Quick Start)
```bash
python3 src/manage.py populate_fire_pump --property-id P1A2B3C4D
```

#### Option B: Multiple Equipment from CSV
```bash
# Edit equipment_template.csv with your data
nano equipment_template.csv

# Preview first
python3 src/manage.py import_equipment_csv equipment_template.csv \
  --property-id P1A2B3C4D \
  --dry-run

# Then import
python3 src/manage.py import_equipment_csv equipment_template.csv \
  --property-id P1A2B3C4D
```

#### Option C: Sample Test Data
```bash
python3 src/manage.py populate_machine_procedures --property-id P1A2B3C4D
```

### Step 4: Verify
```bash
# Check what was created
python3 src/manage.py shell
```

```python
from myappLubd.models import Machine, MaintenanceProcedure

# List all machines
print("\nMachines:")
for m in Machine.objects.all():
    print(f"  {m.machine_id} - {m.name}: {m.maintenance_procedures.count()} procedures")

# List all procedures
print("\nProcedures:")
for p in MaintenanceProcedure.objects.all():
    print(f"  {p.name}: {p.machines.count()} machines, {p.difficulty_level}")
```

## 📝 CSV Template Guide

### Basic Template
```csv
Equipment,Standard,Frequency,Duration_Minutes,Procedure,Responsibility,Difficulty,Location,Status
```

### Field Descriptions

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| Equipment | Yes | Equipment name | Electric Fire Pump |
| Standard | Yes | Compliance standard | Narai Group |
| Frequency | Yes | How often | Weekly, Monthly, Yearly |
| Duration_Minutes | Yes | Time in minutes | 5, 30, 120 |
| Procedure | Yes | What to do | Start and observe... |
| Responsibility | Yes | Who does it | Engineering, MEP Contractor |
| Difficulty | No | Skill level | beginner, intermediate, advanced, expert |
| Location | No | Where it is | Fire Pump Room |
| Status | No | Current status | active, maintenance, inactive |

### Difficulty Levels
- `beginner` - Basic checks, minimal training
- `intermediate` - Some technical knowledge required
- `advanced` - Specialized skills needed
- `expert` - Licensed professional required

### Multiple Procedures per Equipment
Just repeat the equipment name with different frequency:

```csv
Equipment,Standard,Frequency,Duration_Minutes,Procedure,Responsibility,Difficulty
Electric Fire Pump,Narai Group,Weekly,5,Quick test,Engineering,beginner
Electric Fire Pump,Narai Group,Yearly,120,Full flow test,MEP Contractor,advanced
```

## 🔍 Command Options

### populate_fire_pump
```bash
python3 src/manage.py populate_fire_pump --help

Options:
  --property-id TEXT  [REQUIRED] Property ID to assign equipment to
```

### import_equipment_csv
```bash
python3 src/manage.py import_equipment_csv --help

Arguments:
  csv_file           Path to CSV file

Options:
  --property-id TEXT [REQUIRED] Property ID to assign equipment to
  --dry-run          Preview without creating
```

### populate_machine_procedures
```bash
python3 src/manage.py populate_machine_procedures --help

Options:
  --clear            Clear existing data first
  --property-id TEXT Use existing property
```

## 🛠️ Common Tasks

### Add Single Equipment Manually
```bash
python3 src/manage.py shell
```

```python
from myappLubd.models import Machine, MaintenanceProcedure, Property

# Get property
property = Property.objects.get(property_id='P1A2B3C4D')

# Create machine
machine = Machine.objects.create(
    name='Emergency Generator',
    property=property,
    location='Generator Room',
    status='active',
    description='Backup power generator - Narai Group Standard'
)

# Create procedure
procedure = MaintenanceProcedure.objects.create(
    name='Weekly Generator Test - Narai Group',
    description='Weekly generator test procedure',
    difficulty_level='beginner',
    estimated_duration=10,
    steps=[
        {
            'title': 'Start Generator',
            'description': 'Start and run for 10 minutes',
            'estimated_time': 10
        }
    ]
)

# Link them
machine.maintenance_procedures.add(procedure)

print(f"✓ Created: {machine.name} ({machine.machine_id})")
```

### Update Equipment Location
```bash
python3 src/manage.py shell -c "
from myappLubd.models import Machine
m = Machine.objects.get(name='Electric Fire Pump')
m.location = 'Building A - Fire Pump Room'
m.save()
print(f'Updated: {m.name}')
"
```

### Link Existing Procedure to Machine
```bash
python3 src/manage.py shell -c "
from myappLubd.models import Machine, MaintenanceProcedure
m = Machine.objects.get(machine_id='M25XXXXX')
p = MaintenanceProcedure.objects.get(id=1)
m.maintenance_procedures.add(p)
print(f'Linked: {p.name} to {m.name}')
"
```

### Export Current Equipment to CSV
```bash
python3 src/manage.py shell
```

```python
import csv
from myappLubd.models import Machine

with open('current_equipment.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Machine ID', 'Name', 'Location', 'Status', 'Procedures'])
    
    for m in Machine.objects.all():
        writer.writerow([
            m.machine_id,
            m.name,
            m.location,
            m.status,
            m.maintenance_procedures.count()
        ])

print("✓ Exported to current_equipment.csv")
```

## 🎯 Your Next Steps

### For Fire Pump Setup (Recommended)
1. Run migration
2. Get property ID
3. Run: `python3 src/manage.py populate_fire_pump --property-id P12345678`
4. Verify in admin: `/admin/myappLubd/machine/`
5. Create weekly schedule in PreventiveMaintenance

### For Multiple Equipment
1. Edit `equipment_template.csv` with your data
2. Run dry-run to preview
3. Run actual import
4. Verify and adjust as needed

### For Testing/Development
1. Run `populate_machine_procedures` for sample data
2. Test API endpoints
3. Clear with `--clear` flag when ready for real data

## 📚 Documentation Files

- **FIRE_PUMP_SETUP_GUIDE.md** - Detailed fire pump setup
- **MACHINE_PROCEDURE_DATA_GUIDE.md** - General data insertion
- **QUICK_START.md** - Quick reference
- **equipment_template.csv** - CSV template
- **IMPLEMENTATION_SUMMARY.md** - Technical details

## 💡 Pro Tips

1. **Always preview first** - Use `--dry-run` with CSV import
2. **Check property ID** - Wrong property = wrong location
3. **Use consistent naming** - "Weekly", "Monthly", "Yearly" for frequency
4. **Set difficulty levels** - Helps with resource planning
5. **Add details in description** - Future you will thank you

## 🆘 Troubleshooting

### "Property not found"
```bash
# List all properties
python3 src/manage.py shell -c "from myappLubd.models import Property; [print(f'{p.property_id}: {p.name}') for p in Property.objects.all()]"
```

### "CSV file not found"
```bash
# Check current directory
pwd
# File should be at: /home/sqreele/next_last/backend/myLubd/equipment_template.csv
```

### "Command not found"
```bash
# Check if files exist
ls -la src/myappLubd/management/commands/
```

### Clear and start over
```bash
python3 src/manage.py shell -c "
from myappLubd.models import Machine, MaintenanceProcedure
Machine.objects.all().delete()
MaintenanceProcedure.objects.all().delete()
print('Cleared all machines and procedures')
"
```

---

**Choose Your Path:**
- 🔥 **Quick Setup** → `populate_fire_pump`
- 📊 **Bulk Import** → `import_equipment_csv` 
- 🧪 **Test Data** → `populate_machine_procedures`


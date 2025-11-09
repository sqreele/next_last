import csv
from django.core.management.base import BaseCommand
from django.utils import timezone
from myappLubd.models import Machine, MaintenanceProcedure, Property


class Command(BaseCommand):
    help = 'Import equipment and procedures from CSV file'

    def add_arguments(self, parser):
        parser.add_argument(
            'csv_file',
            type=str,
            help='Path to CSV file (e.g., equipment_template.csv)',
        )
        parser.add_argument(
            '--property-id',
            type=str,
            required=True,
            help='Property ID to assign the equipment to',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be created without actually creating it',
        )

    def handle(self, *args, **options):
        csv_file = options['csv_file']
        property_id = options['property_id']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('🔍 DRY RUN MODE - No changes will be made\n'))

        # Get the property
        try:
            property_obj = Property.objects.get(property_id=property_id)
            self.stdout.write(self.style.SUCCESS(f'✓ Using property: {property_obj.name}\n'))
        except Property.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Property {property_id} not found'))
            self.stdout.write('Available properties:')
            for prop in Property.objects.all():
                self.stdout.write(f'  - {prop.property_id}: {prop.name}')
            return

        # Read CSV file
        try:
            with open(csv_file, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                rows = list(reader)
        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f'❌ File not found: {csv_file}'))
            return
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Error reading CSV: {e}'))
            return

        self.stdout.write(f'📄 Found {len(rows)} rows in CSV\n')

        # Group procedures by equipment
        equipment_dict = {}
        for row in rows:
            equipment_name = row.get('Equipment', '').strip()
            if not equipment_name:
                continue

            if equipment_name not in equipment_dict:
                equipment_dict[equipment_name] = {
                    'standard': row.get('Standard', '').strip(),
                    'location': row.get('Location', '').strip(),
                    'status': row.get('Status', 'active').strip().lower(),
                    'procedures': []
                }

            # Add procedure
            equipment_dict[equipment_name]['procedures'].append({
                'frequency': row.get('Frequency', '').strip(),
                'duration': int(row.get('Duration_Minutes', 0)) if row.get('Duration_Minutes') else 0,
                'procedure': row.get('Procedure', '').strip(),
                'responsibility': row.get('Responsibility', '').strip(),
                'difficulty': row.get('Difficulty', 'intermediate').strip().lower(),
            })

        # Process each equipment
        self.stdout.write(self.style.WARNING(f'Processing {len(equipment_dict)} equipment items...\n'))
        
        machines_created = 0
        procedures_created = 0
        links_created = 0

        for equipment_name, equipment_data in equipment_dict.items():
            self.stdout.write(f'\n📦 {equipment_name}')
            self.stdout.write(f'   Standard: {equipment_data["standard"]}')
            self.stdout.write(f'   Location: {equipment_data["location"]}')
            self.stdout.write(f'   Status: {equipment_data["status"]}')

            # Create or get machine
            if not dry_run:
                machine, created = Machine.objects.get_or_create(
                    name=equipment_name,
                    property=property_obj,
                    defaults={
                        'description': f'''{equipment_name} - {equipment_data["standard"]}

Standards Compliance: {equipment_data["standard"]}

Equipment maintained according to company standards with scheduled preventive maintenance.''',
                        'location': equipment_data['location'],
                        'status': equipment_data['status'],
                        'installation_date': timezone.now().date() - timezone.timedelta(days=365)
                    }
                )
                if created:
                    machines_created += 1
                    self.stdout.write(f'   ✅ Created machine: {machine.machine_id}')
                else:
                    self.stdout.write(f'   ℹ️  Machine already exists: {machine.machine_id}')
            else:
                self.stdout.write(f'   [DRY RUN] Would create machine')

            # Process procedures for this equipment
            for idx, proc_data in enumerate(equipment_data['procedures'], 1):
                frequency = proc_data['frequency']
                responsibility = proc_data['responsibility']
                
                # Create procedure name
                proc_name = f'{equipment_name} - {frequency} - {equipment_data["standard"]}'
                
                self.stdout.write(f'\n   📝 Procedure {idx}: {frequency}')
                self.stdout.write(f'      Duration: {proc_data["duration"]} minutes')
                self.stdout.write(f'      Responsibility: {responsibility}')
                self.stdout.write(f'      Difficulty: {proc_data["difficulty"]}')

                if not dry_run:
                    # Create basic steps from procedure description
                    steps = []
                    procedure_text = proc_data['procedure']
                    
                    # Split by periods or numbered steps
                    step_parts = [p.strip() for p in procedure_text.split('.') if p.strip()]
                    
                    for step_idx, step_text in enumerate(step_parts, 1):
                        steps.append({
                            'step_number': step_idx,
                            'title': f'Step {step_idx}',
                            'description': step_text,
                            'estimated_time': proc_data['duration'] // len(step_parts) if step_parts else proc_data['duration'],
                            'required_tools': [],
                            'safety_warnings': [],
                            'notes': f'Responsibility: {responsibility}'
                        })

                    procedure, created = MaintenanceProcedure.objects.get_or_create(
                        name=proc_name,
                        defaults={
                            'description': f'''{frequency} maintenance for {equipment_name}

Standard: {equipment_data["standard"]}
Frequency: {frequency}
Responsibility: {responsibility}

Procedure: {procedure_text}''',
                            'difficulty_level': proc_data['difficulty'],
                            'estimated_duration': proc_data['duration'],
                            'required_tools': 'As specified in procedure steps',
                            'safety_notes': f'Follow {equipment_data["standard"]} safety standards. Responsibility: {responsibility}',
                            'steps': steps
                        }
                    )
                    
                    if created:
                        procedures_created += 1
                        self.stdout.write(f'      ✅ Created procedure')
                    else:
                        self.stdout.write(f'      ℹ️  Procedure already exists')

                    # Link procedure to machine
                    if not machine.maintenance_procedures.filter(id=procedure.id).exists():
                        machine.maintenance_procedures.add(procedure)
                        links_created += 1
                        self.stdout.write(f'      🔗 Linked to machine')
                    else:
                        self.stdout.write(f'      ℹ️  Already linked')
                else:
                    self.stdout.write(f'      [DRY RUN] Would create procedure: {proc_name}')

        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*70))
        if dry_run:
            self.stdout.write(self.style.SUCCESS('DRY RUN COMPLETE - No changes made'))
        else:
            self.stdout.write(self.style.SUCCESS('IMPORT COMPLETE'))
        self.stdout.write(self.style.SUCCESS('='*70))
        
        self.stdout.write(f'\n📊 Summary:')
        self.stdout.write(f'   Equipment items: {len(equipment_dict)}')
        if not dry_run:
            self.stdout.write(f'   Machines created: {machines_created}')
            self.stdout.write(f'   Procedures created: {procedures_created}')
            self.stdout.write(f'   Links created: {links_created}')
        else:
            self.stdout.write(f'   Total procedures: {sum(len(e["procedures"]) for e in equipment_dict.values())}')
        
        if not dry_run:
            self.stdout.write(self.style.SUCCESS('\n✅ All equipment and procedures imported successfully!'))
            self.stdout.write(f'   Property: {property_obj.name} ({property_obj.property_id})')
            self.stdout.write(f'   Check Django Admin: /admin/myappLubd/machine/')
        else:
            self.stdout.write(self.style.WARNING('\n💡 Run without --dry-run to actually create the data'))
            self.stdout.write(f'   Command: python3 src/manage.py import_equipment_csv {csv_file} --property-id {property_id}')


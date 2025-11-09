from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from myappLubd.models import Machine, MaintenanceProcedure, Property

User = get_user_model()


class Command(BaseCommand):
    help = 'Populate database with sample machines and maintenance procedures'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing machines and procedures before creating new ones',
        )
        parser.add_argument(
            '--property-id',
            type=str,
            help='Use existing property ID (otherwise creates a test property)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Starting data population...'))

        # Clear existing data if requested
        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing data...'))
            Machine.objects.all().delete()
            MaintenanceProcedure.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('✓ Cleared existing data'))

        # Get or create a property
        if options['property_id']:
            try:
                property_obj = Property.objects.get(property_id=options['property_id'])
                self.stdout.write(self.style.SUCCESS(f'✓ Using existing property: {property_obj.name}'))
            except Property.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Property {options["property_id"]} not found'))
                return
        else:
            property_obj, created = Property.objects.get_or_create(
                name='Test Facility',
                defaults={
                    'description': 'Test facility for demonstration purposes',
                    'is_preventivemaintenance': True
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'✓ Created test property: {property_obj.name}'))
            else:
                self.stdout.write(self.style.SUCCESS(f'✓ Using existing property: {property_obj.name}'))

        # Create Maintenance Procedures
        self.stdout.write(self.style.WARNING('\nCreating maintenance procedures...'))
        
        procedures_data = [
            {
                'name': 'Daily Safety Inspection',
                'description': 'Quick daily safety check for all equipment',
                'difficulty_level': 'beginner',
                'estimated_duration': 15,
                'required_tools': 'Flashlight, checklist',
                'safety_notes': 'Visual inspection only, no hands-on work required',
                'steps': [
                    {
                        'title': 'Visual Inspection',
                        'description': 'Check for visible damage, leaks, or unusual conditions',
                        'estimated_time': 5,
                        'required_tools': ['flashlight'],
                        'safety_warnings': ['Do not touch hot surfaces']
                    },
                    {
                        'title': 'Check Safety Guards',
                        'description': 'Ensure all safety guards and barriers are in place',
                        'estimated_time': 5,
                        'required_tools': []
                    },
                    {
                        'title': 'Document Findings',
                        'description': 'Record any issues in maintenance log',
                        'estimated_time': 5,
                        'required_tools': ['checklist']
                    }
                ]
            },
            {
                'name': 'Weekly Pump Maintenance',
                'description': 'Weekly maintenance routine for industrial pumps',
                'difficulty_level': 'intermediate',
                'estimated_duration': 60,
                'required_tools': 'Wrench set, lubricant, pressure gauge, cleaning supplies',
                'safety_notes': 'Lock out pump before starting work. Wear PPE.',
                'steps': [
                    {
                        'title': 'Lockout/Tagout',
                        'description': 'Shut down and lock out pump following LOTO procedure',
                        'estimated_time': 10,
                        'required_tools': ['lockout kit'],
                        'safety_warnings': ['Verify zero energy state before proceeding']
                    },
                    {
                        'title': 'Check Lubrication',
                        'description': 'Inspect and refill lubricant levels',
                        'estimated_time': 15,
                        'required_tools': ['lubricant', 'wrench_set']
                    },
                    {
                        'title': 'Inspect Seals',
                        'description': 'Check pump seals for wear or leaks',
                        'estimated_time': 15,
                        'required_tools': ['flashlight']
                    },
                    {
                        'title': 'Test Pressure',
                        'description': 'Restart pump and verify operating pressure',
                        'estimated_time': 10,
                        'required_tools': ['pressure_gauge']
                    },
                    {
                        'title': 'Clean and Document',
                        'description': 'Clean work area and update maintenance log',
                        'estimated_time': 10,
                        'required_tools': ['cleaning_supplies']
                    }
                ]
            },
            {
                'name': 'Monthly HVAC System Check',
                'description': 'Comprehensive monthly HVAC maintenance',
                'difficulty_level': 'intermediate',
                'estimated_duration': 90,
                'required_tools': 'Multimeter, filter wrench, cleaning supplies, refrigerant gauge',
                'safety_notes': 'Qualified HVAC technician required. High voltage present.',
                'steps': [
                    {
                        'title': 'Replace Air Filters',
                        'description': 'Remove old filters and install new ones',
                        'estimated_time': 20,
                        'required_tools': ['filter_wrench', 'replacement_filters']
                    },
                    {
                        'title': 'Check Refrigerant Levels',
                        'description': 'Test refrigerant pressure and add if needed',
                        'estimated_time': 25,
                        'required_tools': ['refrigerant_gauge', 'refrigerant']
                    },
                    {
                        'title': 'Inspect Electrical Connections',
                        'description': 'Test voltage and tighten connections',
                        'estimated_time': 20,
                        'required_tools': ['multimeter', 'screwdriver'],
                        'safety_warnings': ['Turn off power before working on electrical']
                    },
                    {
                        'title': 'Clean Condensers and Evaporators',
                        'description': 'Remove debris and clean coils',
                        'estimated_time': 25,
                        'required_tools': ['cleaning_supplies', 'coil_cleaner']
                    }
                ]
            },
            {
                'name': 'Quarterly Compressor Overhaul',
                'description': 'Detailed compressor inspection and service',
                'difficulty_level': 'advanced',
                'estimated_duration': 180,
                'required_tools': 'Complete tool set, replacement parts, pressure testing equipment',
                'safety_notes': 'Certified technician only. Pressurized system - extreme caution required.',
                'steps': [
                    {
                        'title': 'System Depressurization',
                        'description': 'Safely depressurize the compressor system',
                        'estimated_time': 30,
                        'required_tools': ['pressure_gauge', 'relief_valve'],
                        'safety_warnings': ['Release pressure slowly', 'Wear face shield']
                    },
                    {
                        'title': 'Disassemble Unit',
                        'description': 'Remove covers and access internal components',
                        'estimated_time': 40,
                        'required_tools': ['wrench_set', 'socket_set']
                    },
                    {
                        'title': 'Inspect Internal Components',
                        'description': 'Check pistons, valves, and seals for wear',
                        'estimated_time': 30,
                        'required_tools': ['inspection_mirror', 'flashlight', 'calipers']
                    },
                    {
                        'title': 'Replace Worn Parts',
                        'description': 'Install new seals, gaskets, and other worn components',
                        'estimated_time': 40,
                        'required_tools': ['replacement_parts', 'torque_wrench']
                    },
                    {
                        'title': 'Reassemble and Test',
                        'description': 'Reassemble unit and perform pressure test',
                        'estimated_time': 40,
                        'required_tools': ['torque_wrench', 'pressure_tester', 'leak_detector']
                    }
                ]
            },
            {
                'name': 'Annual Boiler Inspection',
                'description': 'Comprehensive annual boiler safety and efficiency inspection',
                'difficulty_level': 'expert',
                'estimated_duration': 240,
                'required_tools': 'Complete diagnostic equipment, welding tools, safety equipment',
                'safety_notes': 'Licensed boiler inspector required. High temperature and pressure system.',
                'steps': [
                    {
                        'title': 'Safety Shutdown',
                        'description': 'Complete system shutdown following safety protocols',
                        'estimated_time': 30,
                        'required_tools': ['lockout_kit'],
                        'safety_warnings': ['Allow minimum 24 hours cooling time']
                    },
                    {
                        'title': 'Internal Inspection',
                        'description': 'Enter vessel and inspect internal surfaces',
                        'estimated_time': 60,
                        'required_tools': ['inspection_equipment', 'lighting', 'confined_space_monitor'],
                        'safety_warnings': ['Confined space entry procedures required']
                    },
                    {
                        'title': 'Non-Destructive Testing',
                        'description': 'Ultrasonic testing of critical welds and surfaces',
                        'estimated_time': 60,
                        'required_tools': ['ultrasonic_tester', 'thickness_gauge']
                    },
                    {
                        'title': 'Pressure Relief Testing',
                        'description': 'Test all safety valves and relief systems',
                        'estimated_time': 30,
                        'required_tools': ['test_bench', 'calibration_equipment']
                    },
                    {
                        'title': 'Water Treatment Check',
                        'description': 'Test water chemistry and treatment systems',
                        'estimated_time': 30,
                        'required_tools': ['water_test_kit', 'chemical_treatment']
                    },
                    {
                        'title': 'Documentation and Certification',
                        'description': 'Complete inspection reports and certification',
                        'estimated_time': 30,
                        'required_tools': ['inspection_forms']
                    }
                ]
            },
            {
                'name': 'Conveyor Belt Maintenance',
                'description': 'Regular conveyor belt inspection and adjustment',
                'difficulty_level': 'intermediate',
                'estimated_duration': 45,
                'required_tools': 'Tension gauge, alignment tools, cleaning supplies',
                'safety_notes': 'Lock out system before working. Pinch point hazards.',
                'steps': [
                    {
                        'title': 'Check Belt Tension',
                        'description': 'Measure and adjust belt tension to specifications',
                        'estimated_time': 15,
                        'required_tools': ['tension_gauge', 'wrench_set']
                    },
                    {
                        'title': 'Inspect for Wear',
                        'description': 'Check belt for cracks, tears, or excessive wear',
                        'estimated_time': 15,
                        'required_tools': ['flashlight']
                    },
                    {
                        'title': 'Clean and Lubricate',
                        'description': 'Remove debris and lubricate rollers',
                        'estimated_time': 15,
                        'required_tools': ['cleaning_supplies', 'lubricant']
                    }
                ]
            }
        ]

        procedures = []
        for proc_data in procedures_data:
            procedure, created = MaintenanceProcedure.objects.get_or_create(
                name=proc_data['name'],
                defaults={
                    'description': proc_data['description'],
                    'difficulty_level': proc_data['difficulty_level'],
                    'estimated_duration': proc_data['estimated_duration'],
                    'required_tools': proc_data['required_tools'],
                    'safety_notes': proc_data['safety_notes'],
                    'steps': proc_data['steps']
                }
            )
            procedures.append(procedure)
            status = 'Created' if created else 'Already exists'
            self.stdout.write(f'  {status}: {procedure.name} ({procedure.difficulty_level})')

        self.stdout.write(self.style.SUCCESS(f'\n✓ Total procedures: {len(procedures)}'))

        # Create Machines
        self.stdout.write(self.style.WARNING('\nCreating machines...'))
        
        machines_data = [
            {
                'name': 'Industrial Pump #1',
                'description': 'Main water circulation pump for cooling system',
                'location': 'Building A - Mechanical Room',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Weekly Pump Maintenance']
            },
            {
                'name': 'Industrial Pump #2',
                'description': 'Backup water circulation pump',
                'location': 'Building A - Mechanical Room',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Weekly Pump Maintenance']
            },
            {
                'name': 'HVAC Unit - North Wing',
                'description': 'Main HVAC system for north wing offices',
                'location': 'Roof - North Section',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Monthly HVAC System Check']
            },
            {
                'name': 'HVAC Unit - South Wing',
                'description': 'Main HVAC system for south wing offices',
                'location': 'Roof - South Section',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Monthly HVAC System Check']
            },
            {
                'name': 'Air Compressor #1',
                'description': 'Primary compressed air system',
                'location': 'Building B - Utility Room',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Quarterly Compressor Overhaul']
            },
            {
                'name': 'Air Compressor #2',
                'description': 'Secondary compressed air system',
                'location': 'Building B - Utility Room',
                'status': 'maintenance',
                'procedures': ['Quarterly Compressor Overhaul']
            },
            {
                'name': 'Boiler System',
                'description': 'Central heating boiler',
                'location': 'Building A - Basement',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Annual Boiler Inspection']
            },
            {
                'name': 'Production Conveyor Line 1',
                'description': 'Main production line conveyor system',
                'location': 'Production Floor - West Side',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Conveyor Belt Maintenance']
            },
            {
                'name': 'Production Conveyor Line 2',
                'description': 'Secondary production line conveyor',
                'location': 'Production Floor - East Side',
                'status': 'active',
                'procedures': ['Daily Safety Inspection', 'Conveyor Belt Maintenance']
            },
            {
                'name': 'Warehouse Conveyor',
                'description': 'Warehouse material handling conveyor',
                'location': 'Warehouse - Loading Dock',
                'status': 'inactive',
                'procedures': ['Conveyor Belt Maintenance']
            }
        ]

        machines = []
        for machine_data in machines_data:
            # Get procedures by name
            procedure_names = machine_data.pop('procedures')
            
            machine, created = Machine.objects.get_or_create(
                name=machine_data['name'],
                property=property_obj,
                defaults={
                    'description': machine_data['description'],
                    'location': machine_data['location'],
                    'status': machine_data['status'],
                    'installation_date': timezone.now().date() - timezone.timedelta(days=365)
                }
            )
            
            # Link procedures to machine
            for proc_name in procedure_names:
                try:
                    procedure = MaintenanceProcedure.objects.get(name=proc_name)
                    machine.maintenance_procedures.add(procedure)
                except MaintenanceProcedure.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f'  Procedure not found: {proc_name}'))
            
            machines.append(machine)
            status = 'Created' if created else 'Already exists'
            proc_count = machine.maintenance_procedures.count()
            self.stdout.write(f'  {status}: {machine.name} ({proc_count} procedures)')

        self.stdout.write(self.style.SUCCESS(f'\n✓ Total machines: {len(machines)}'))

        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('DATA POPULATION COMPLETE'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'Property: {property_obj.name} ({property_obj.property_id})')
        self.stdout.write(f'Procedures created: {len(procedures)}')
        self.stdout.write(f'Machines created: {len(machines)}')
        
        # Show some stats
        self.stdout.write(self.style.WARNING('\nProcedure Statistics:'))
        for proc in procedures:
            machine_count = proc.machines.count()
            self.stdout.write(f'  • {proc.name}: {machine_count} machines')
        
        self.stdout.write(self.style.SUCCESS('\n✓ You can now test the Machine-Procedure relationship!'))
        self.stdout.write(self.style.SUCCESS('  Run migrations first: python manage.py migrate'))
        self.stdout.write(self.style.SUCCESS('  Then check Django Admin or API endpoints'))



from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from myappLubd.models import Machine, MaintenanceProcedure, Property

User = get_user_model()


class Command(BaseCommand):
    help = 'Populate Electric Fire Pump with Narai Group standards'

    def add_arguments(self, parser):
        parser.add_argument(
            '--property-id',
            type=str,
            required=True,
            help='Property ID to assign the equipment to',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Creating Electric Fire Pump maintenance data...'))

        # Get the property
        try:
            property_obj = Property.objects.get(property_id=options['property_id'])
            self.stdout.write(self.style.SUCCESS(f'✓ Using property: {property_obj.name}'))
        except Property.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Property {options["property_id"]} not found'))
            self.stdout.write('Available properties:')
            for prop in Property.objects.all():
                self.stdout.write(f'  - {prop.property_id}: {prop.name}')
            return

        # Create Weekly Fire Pump Testing Procedure
        self.stdout.write(self.style.WARNING('\nCreating maintenance procedures...'))
        
        weekly_procedure, created = MaintenanceProcedure.objects.get_or_create(
            name='Weekly Fire Pump Testing - Narai Group Standard',
            defaults={
                'description': '''Weekly fire pump testing procedure according to Narai Group standards.
                
Standard: Narai Group
Frequency: Weekly (5 minutes)
Responsibility: Engineering Department

This procedure ensures the fire pump is operational and ready for emergency use.''',
                'difficulty_level': 'beginner',
                'estimated_duration': 5,
                'required_tools': 'Test valve access, observation checklist, timer',
                'safety_notes': '''Safety Requirements:
- Ensure proper PPE (safety shoes, hard hat)
- Notify security/fire safety team before testing
- Do not test during high-risk periods
- Keep clear of pump area during operation
- Have emergency shutdown procedure ready''',
                'steps': [
                    {
                        'step_number': 1,
                        'title': 'Pre-Start Safety Check',
                        'description': 'Verify area is clear and notify relevant personnel that fire pump testing will commence',
                        'estimated_time': 1,
                        'required_tools': ['radio', 'checklist'],
                        'safety_warnings': ['Notify security and fire safety team'],
                        'notes': 'Responsibility: Engineering'
                    },
                    {
                        'step_number': 2,
                        'title': 'Start Fire Pump',
                        'description': 'Start the electric fire pump and observe initial operation for any unusual sounds or vibrations',
                        'estimated_time': 1,
                        'required_tools': ['control_panel_access'],
                        'safety_warnings': ['Stand clear of rotating equipment', 'Listen for unusual sounds'],
                        'notes': 'Observe: motor sound, vibration, startup smoothness'
                    },
                    {
                        'step_number': 3,
                        'title': 'Open Test Valve',
                        'description': 'Open the test valve to simulate water flow conditions during pump operation',
                        'estimated_time': 2,
                        'required_tools': ['test_valve_key'],
                        'safety_warnings': ['Ensure proper drainage', 'Watch for water pressure'],
                        'notes': 'Simulate actual fire emergency water flow'
                    },
                    {
                        'step_number': 4,
                        'title': 'Observe Running Operation',
                        'description': 'Monitor pump operation for 2 minutes: check pressure gauge, flow rate, temperature, and any leaks',
                        'estimated_time': 2,
                        'required_tools': ['pressure_gauge', 'timer'],
                        'safety_warnings': [],
                        'notes': 'Record: pressure reading, flow status, any abnormalities'
                    },
                    {
                        'step_number': 5,
                        'title': 'Shutdown and Document',
                        'description': 'Close test valve, shut down pump properly, and document test results in maintenance log',
                        'estimated_time': 1,
                        'required_tools': ['maintenance_log'],
                        'safety_warnings': [],
                        'notes': 'Record date, time, observations, and technician name'
                    }
                ]
            }
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: Weekly Fire Pump Testing')

        # Create Yearly Flow Test Procedure
        yearly_procedure, created = MaintenanceProcedure.objects.get_or_create(
            name='Annual Fire Pump Flow Test - Narai Group Standard',
            defaults={
                'description': '''Comprehensive annual flow test for electric fire pump according to Narai Group standards.

Standard: Narai Group
Frequency: Yearly
Responsibility: MEP Contractor (Licensed)

Full performance test to verify pump meets required flow and pressure specifications.''',
                'difficulty_level': 'advanced',
                'estimated_duration': 120,
                'required_tools': '''Flow meter, pressure gauges, test manifold, hoses, 
drainage equipment, calibration tools, documentation forms''',
                'safety_notes': '''Critical Safety Requirements:
- Must be performed by licensed MEP contractor
- Full LOTO (Lockout/Tagout) procedure required
- Emergency services must be notified
- Fire protection system bypass procedures must be followed
- Proper drainage must be in place
- All personnel must maintain safe distance during high-pressure testing
- Emergency shutdown procedures must be established''',
                'steps': [
                    {
                        'step_number': 1,
                        'title': 'Pre-Test Preparation and Notifications',
                        'description': '''Prepare test equipment, notify building management, fire department, 
and security. Ensure proper permits and safety measures are in place.''',
                        'estimated_time': 20,
                        'required_tools': ['permits', 'notification_forms', 'test_equipment'],
                        'safety_warnings': [
                            'Obtain all required permits',
                            'Notify emergency services',
                            'Ensure backup fire protection'
                        ],
                        'notes': '''Responsibility: MEP Contractor
Required notifications:
- Building management (48 hours advance)
- Local fire department
- Security team
- Insurance company (if required)'''
                    },
                    {
                        'step_number': 2,
                        'title': 'Install Flow Test Equipment',
                        'description': '''Connect flow meter, pressure gauges, test manifold, and drainage hoses. 
Verify all equipment is calibrated and functioning properly.''',
                        'estimated_time': 30,
                        'required_tools': [
                            'flow_meter',
                            'pressure_gauges',
                            'test_manifold',
                            'drainage_hoses',
                            'calibration_certificates'
                        ],
                        'safety_warnings': [
                            'Ensure secure connections',
                            'Verify proper drainage path',
                            'Check equipment calibration dates'
                        ],
                        'notes': 'All test equipment must have valid calibration certificates'
                    },
                    {
                        'step_number': 3,
                        'title': 'Conduct No-Flow Pressure Test',
                        'description': '''Start pump and measure static pressure (churn pressure) with no flow. 
Record baseline pressure readings.''',
                        'estimated_time': 10,
                        'required_tools': ['pressure_gauge', 'data_recording_sheet'],
                        'safety_warnings': [
                            'Do not run at churn for extended periods',
                            'Monitor pump temperature'
                        ],
                        'notes': 'Record: static pressure, pump RPM, power consumption'
                    },
                    {
                        'step_number': 4,
                        'title': 'Conduct Rated Flow Test',
                        'description': '''Open test valves to achieve 100% rated flow. Measure and record pressure, 
flow rate, and pump performance at rated capacity.''',
                        'estimated_time': 20,
                        'required_tools': [
                            'flow_meter',
                            'pressure_gauges',
                            'tachometer',
                            'ammeter'
                        ],
                        'safety_warnings': [
                            'Gradually open valves',
                            'Monitor all gauges continuously',
                            'Watch for cavitation',
                            'Monitor motor current'
                        ],
                        'notes': '''Record at rated flow:
- Flow rate (GPM or L/min)
- Discharge pressure
- Suction pressure
- Motor current
- Pump RPM
- Any unusual sounds or vibrations'''
                    },
                    {
                        'step_number': 5,
                        'title': 'Conduct 150% Flow Test',
                        'description': '''Increase flow to 150% of rated capacity and measure pump performance 
at maximum expected demand.''',
                        'estimated_time': 15,
                        'required_tools': [
                            'flow_meter',
                            'pressure_gauges',
                            'temperature_gauge'
                        ],
                        'safety_warnings': [
                            'Monitor pump and motor temperature closely',
                            'Watch for excessive vibration',
                            'Be ready for emergency shutdown',
                            'Ensure adequate cooling'
                        ],
                        'notes': 'Record same parameters as rated flow test. Compare against manufacturer specifications.'
                    },
                    {
                        'step_number': 6,
                        'title': 'Shutdown and Equipment Removal',
                        'description': '''Gradually reduce flow, shut down pump properly, depressurize system, 
and remove test equipment. Restore system to normal operation.''',
                        'estimated_time': 20,
                        'required_tools': ['wrenches', 'pressure_relief_tools'],
                        'safety_warnings': [
                            'Depressurize slowly',
                            'Ensure complete drainage',
                            'Verify system integrity before restoring'
                        ],
                        'notes': 'Perform visual inspection for any leaks or damage before restoring to service'
                    },
                    {
                        'step_number': 7,
                        'title': 'Analysis and Documentation',
                        'description': '''Analyze test results against NFPA 25 standards and manufacturer specifications. 
Prepare comprehensive test report with recommendations.''',
                        'estimated_time': 30,
                        'required_tools': [
                            'computer',
                            'test_report_template',
                            'NFPA_25_standard',
                            'manufacturer_specs'
                        ],
                        'safety_warnings': [],
                        'notes': '''Report must include:
- All test measurements and calculations
- Pump curve comparison
- Pass/Fail determination
- Deficiencies noted
- Recommendations for repairs or adjustments
- Next test due date
- Contractor certification and signature'''
                    }
                ]
            }
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: Annual Fire Pump Flow Test')

        # Create Electric Fire Pump Machine
        self.stdout.write(self.style.WARNING('\nCreating equipment...'))
        
        fire_pump, created = Machine.objects.get_or_create(
            name='Electric Fire Pump',
            property=property_obj,
            defaults={
                'description': '''Electric fire pump system - Narai Group Standard
                
Critical life safety equipment providing water pressure for fire suppression system.

Standards Compliance:
- Narai Group maintenance standards
- NFPA 25: Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems
- Local fire code requirements

Maintenance Schedule:
- Weekly: Start and flow test (5 minutes) - Engineering
- Yearly: Comprehensive flow test - MEP Contractor''',
                'location': 'Fire Pump Room / Mechanical Room',
                'status': 'active',
                'installation_date': timezone.now().date() - timezone.timedelta(days=365)
            }
        )
        
        if created:
            self.stdout.write(f'  ✓ Created: {fire_pump.name} ({fire_pump.machine_id})')
        else:
            self.stdout.write(f'  ✓ Already exists: {fire_pump.name} ({fire_pump.machine_id})')

        # Link procedures to machine
        fire_pump.maintenance_procedures.add(weekly_procedure, yearly_procedure)
        self.stdout.write(f'  ✓ Linked {fire_pump.maintenance_procedures.count()} procedures to {fire_pump.name}')

        # Display summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*70))
        self.stdout.write(self.style.SUCCESS('ELECTRIC FIRE PUMP SETUP COMPLETE'))
        self.stdout.write(self.style.SUCCESS('='*70))
        
        self.stdout.write(f'\n📋 Equipment: {fire_pump.name}')
        self.stdout.write(f'   ID: {fire_pump.machine_id}')
        self.stdout.write(f'   Property: {property_obj.name} ({property_obj.property_id})')
        self.stdout.write(f'   Location: {fire_pump.location}')
        self.stdout.write(f'   Status: {fire_pump.status}')
        
        self.stdout.write('\n📝 Maintenance Procedures:')
        self.stdout.write(f'\n   1️⃣  Weekly Testing (5 mins)')
        self.stdout.write(f'      Name: {weekly_procedure.name}')
        self.stdout.write(f'      Frequency: Weekly')
        self.stdout.write(f'      Duration: {weekly_procedure.estimated_duration} minutes')
        self.stdout.write(f'      Difficulty: {weekly_procedure.difficulty_level}')
        self.stdout.write(f'      Responsibility: Engineering Department')
        self.stdout.write(f'      Steps: {len(weekly_procedure.steps)}')
        
        self.stdout.write(f'\n   2️⃣  Annual Flow Test (2 hours)')
        self.stdout.write(f'      Name: {yearly_procedure.name}')
        self.stdout.write(f'      Frequency: Yearly')
        self.stdout.write(f'      Duration: {yearly_procedure.estimated_duration} minutes')
        self.stdout.write(f'      Difficulty: {yearly_procedure.difficulty_level}')
        self.stdout.write(f'      Responsibility: MEP Contractor (Licensed)')
        self.stdout.write(f'      Steps: {len(yearly_procedure.steps)}')
        
        self.stdout.write(self.style.SUCCESS('\n✅ Standard: Narai Group'))
        self.stdout.write(self.style.SUCCESS('\n✓ Ready to use in Django Admin or API'))
        self.stdout.write(f'\n   Admin: /admin/myappLubd/machine/{fire_pump.id}/change/')
        self.stdout.write(f'   API: /api/v1/machines/{fire_pump.id}/')


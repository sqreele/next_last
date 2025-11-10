from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from myappLubd.models import Machine, MaintenanceProcedure, PreventiveMaintenance, Property

User = get_user_model()


class Command(BaseCommand):
    help = 'Populate Electric Fire Pump with maintenance tasks following ER diagram structure'

    def add_arguments(self, parser):
        parser.add_argument(
            '--property-id',
            type=str,
            required=True,
            help='Property ID to assign the equipment to',
        )
        parser.add_argument(
            '--create-schedule',
            action='store_true',
            help='Also create maintenance schedules',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Creating Electric Fire Pump with ER diagram structure...\n'))

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

        # Create Equipment (following ER diagram)
        self.stdout.write(self.style.WARNING('\n📦 Creating Equipment...'))
        
        equipment, created = Machine.objects.get_or_create(
            serial_number='FP-2024-001',  # Unique identifier
            defaults={
                'name': 'Electric Fire Pump',
                'brand': 'Grundfos',  # ER diagram field
                'category': 'Fire Protection System',  # ER diagram field
                'description': '''Electric fire pump system - Narai Group Standard
                
Critical life safety equipment providing water pressure for fire suppression system.

Standards Compliance:
- Narai Group maintenance standards
- NFPA 25: Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems
- Local fire code requirements''',
                'location': 'Fire Pump Room',
                'status': 'active',
                'property': property_obj,
                'installation_date': timezone.now().date() - timezone.timedelta(days=365)
            }
        )
        
        if created:
            self.stdout.write(f'  ✅ Created equipment: {equipment.name} ({equipment.machine_id})')
            self.stdout.write(f'     Brand: {equipment.brand}')
            self.stdout.write(f'     Category: {equipment.category}')
            self.stdout.write(f'     Serial Number: {equipment.serial_number}')
        else:
            self.stdout.write(f'  ℹ️  Equipment already exists: {equipment.name} ({equipment.machine_id})')

        # Create Maintenance Tasks (following ER diagram)
        self.stdout.write(self.style.WARNING('\n📝 Creating Maintenance Tasks...'))
        
        # Task 1: Weekly Testing
        weekly_task, created = MaintenanceProcedure.objects.get_or_create(
            equipment=equipment,
            name='Weekly Fire Pump Testing',
            frequency='weekly',
            defaults={
                'description': '''Weekly fire pump testing procedure according to Narai Group standards.

Standard: Narai Group
Frequency: Weekly (5 minutes)
Responsibility: Engineering Department

This procedure ensures the fire pump is operational and ready for emergency use.''',
                'estimated_duration': '5 mins',  # ER diagram field (text)
                'responsible_department': 'Engineering',  # ER diagram field
                'difficulty_level': 'beginner',
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
        
        if created:
            self.stdout.write(f'  ✅ Created task: {weekly_task.name}')
        else:
            self.stdout.write(f'  ℹ️  Task already exists: {weekly_task.name}')
        self.stdout.write(f'     Frequency: {weekly_task.frequency}')
        self.stdout.write(f'     Duration: {weekly_task.estimated_duration}')
        self.stdout.write(f'     Responsibility: {weekly_task.responsible_department}')
        self.stdout.write(f'     Steps: {len(weekly_task.steps)}')

        # Task 2: Annual Flow Test
        annual_task, created = MaintenanceProcedure.objects.get_or_create(
            equipment=equipment,
            name='Annual Fire Pump Flow Test',
            frequency='annual',
            defaults={
                'description': '''Comprehensive annual flow test for electric fire pump according to Narai Group standards.

Standard: Narai Group
Frequency: Yearly
Responsibility: MEP Contractor (Licensed)

Full performance test to verify pump meets required flow and pressure specifications.''',
                'estimated_duration': '2 hours',  # ER diagram field (text)
                'responsible_department': 'MEP Contractor',  # ER diagram field
                'difficulty_level': 'advanced',
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
                        'notes': 'Responsibility: MEP Contractor'
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
                        ]
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
                        ]
                    },
                    {
                        'step_number': 4,
                        'title': 'Conduct Rated Flow Test',
                        'description': '''Open test valves to achieve 100% rated flow. Measure and record pressure, 
flow rate, and pump performance at rated capacity.''',
                        'estimated_time': 20,
                        'required_tools': ['flow_meter', 'pressure_gauges', 'tachometer', 'ammeter'],
                        'safety_warnings': [
                            'Gradually open valves',
                            'Monitor all gauges continuously',
                            'Watch for cavitation',
                            'Monitor motor current'
                        ]
                    },
                    {
                        'step_number': 5,
                        'title': 'Conduct 150% Flow Test',
                        'description': '''Increase flow to 150% of rated capacity and measure pump performance 
at maximum expected demand.''',
                        'estimated_time': 15,
                        'required_tools': ['flow_meter', 'pressure_gauges', 'temperature_gauge'],
                        'safety_warnings': [
                            'Monitor pump and motor temperature closely',
                            'Watch for excessive vibration',
                            'Be ready for emergency shutdown'
                        ]
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
                        ]
                    },
                    {
                        'step_number': 7,
                        'title': 'Analysis and Documentation',
                        'description': '''Analyze test results against NFPA 25 standards and manufacturer specifications. 
Prepare comprehensive test report with recommendations.''',
                        'estimated_time': 30,
                        'required_tools': ['computer', 'test_report_template', 'NFPA_25_standard']
                    }
                ]
            }
        )
        
        if created:
            self.stdout.write(f'  ✅ Created task: {annual_task.name}')
        else:
            self.stdout.write(f'  ℹ️  Task already exists: {annual_task.name}')
        self.stdout.write(f'     Frequency: {annual_task.frequency}')
        self.stdout.write(f'     Duration: {annual_task.estimated_duration}')
        self.stdout.write(f'     Responsibility: {annual_task.responsible_department}')
        self.stdout.write(f'     Steps: {len(annual_task.steps)}')

        # Create Maintenance Schedules (if requested)
        if options['create_schedule']:
            self.stdout.write(self.style.WARNING('\n📅 Creating Maintenance Schedules...'))
            
            # Get or create a user for assignment
            try:
                engineer_user = User.objects.filter(
                    userprofile__positions__icontains='engineer'
                ).first() or User.objects.filter(is_staff=True).first() or User.objects.first()
                
                if not engineer_user:
                    self.stdout.write(self.style.WARNING('  ⚠️  No users found. Skipping schedule creation.'))
                else:
                    # Create weekly schedule
                    next_week = timezone.now() + timezone.timedelta(days=7)
                    weekly_schedule, created = PreventiveMaintenance.objects.get_or_create(
                        procedure_template=weekly_task,
                        scheduled_date=next_week,
                        defaults={
                            'pmtitle': f'Weekly Fire Pump Test - {next_week.strftime("%Y-%m-%d")}',
                            'frequency': 'weekly',
                            'status': 'pending',
                            'priority': 'high',
                            'assigned_to': engineer_user,  # ER diagram field
                            'remarks': 'Standard weekly test as per Narai Group standards',  # ER diagram field
                            'estimated_duration': 5,
                            'created_by': engineer_user
                        }
                    )
                    
                    if created:
                        self.stdout.write(f'  ✅ Created schedule: {weekly_schedule.pm_id}')
                        self.stdout.write(f'     Assigned to: {engineer_user.username}')
                        self.stdout.write(f'     Scheduled: {next_week.strftime("%Y-%m-%d %H:%M")}')
                    else:
                        self.stdout.write(f'  ℹ️  Schedule already exists: {weekly_schedule.pm_id}')

                    # Create annual schedule
                    next_year = timezone.now() + timezone.timedelta(days=365)
                    annual_schedule, created = PreventiveMaintenance.objects.get_or_create(
                        procedure_template=annual_task,
                        scheduled_date=next_year,
                        defaults={
                            'pmtitle': f'Annual Fire Pump Flow Test - {next_year.strftime("%Y")}',
                            'frequency': 'annual',
                            'status': 'pending',
                            'priority': 'critical',
                            'assigned_to': engineer_user,  # ER diagram field
                            'remarks': 'NFPA 25 compliance test - MEP Contractor required',  # ER diagram field
                            'estimated_duration': 120,
                            'created_by': engineer_user
                        }
                    )
                    
                    if created:
                        self.stdout.write(f'  ✅ Created schedule: {annual_schedule.pm_id}')
                        self.stdout.write(f'     Assigned to: {engineer_user.username}')
                        self.stdout.write(f'     Scheduled: {next_year.strftime("%Y-%m-%d %H:%M")}')
                    else:
                        self.stdout.write(f'  ℹ️  Schedule already exists: {annual_schedule.pm_id}')
                        
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ❌ Error creating schedules: {e}'))

        # Summary
        self.stdout.write(self.style.SUCCESS('\n' + '='*70))
        self.stdout.write(self.style.SUCCESS('SETUP COMPLETE - ER DIAGRAM STRUCTURE'))
        self.stdout.write(self.style.SUCCESS('='*70))
        
        self.stdout.write(f'\n📦 Equipment: {equipment.name}')
        self.stdout.write(f'   ID: {equipment.machine_id}')
        self.stdout.write(f'   Brand: {equipment.brand}')
        self.stdout.write(f'   Category: {equipment.category}')
        self.stdout.write(f'   Serial Number: {equipment.serial_number}')
        self.stdout.write(f'   Property: {property_obj.name} ({property_obj.property_id})')
        self.stdout.write(f'   Location: {equipment.location}')
        
        # Maintenance tasks relationship removed - equipment no longer linked to task templates
        self.stdout.write('\n📝 Maintenance Tasks: Not applicable (equipment no longer linked to task templates)')
        
        if options['create_schedule']:
            self.stdout.write('\n📅 Maintenance Schedules:')
            # Equipment no longer linked to task templates - filter by machines instead
            schedules = PreventiveMaintenance.objects.filter(
                machines=equipment
            ).order_by('scheduled_date')
            for schedule in schedules:
                self.stdout.write(f'\n   • {schedule.pmtitle}')
                self.stdout.write(f'     ID: {schedule.pm_id}')
                self.stdout.write(f'     Status: {schedule.status}')
                self.stdout.write(f'     Assigned to: {schedule.assigned_to.username if schedule.assigned_to else "Unassigned"}')
                self.stdout.write(f'     Scheduled: {schedule.scheduled_date.strftime("%Y-%m-%d")}')
        
        self.stdout.write(self.style.SUCCESS('\n✓ Updated Structure:'))
        self.stdout.write(f'  MaintenanceTask: Generic templates (no equipment link)')
        self.stdout.write(f'  PreventiveMaintenance: Links to machines via M2M relationship')
        self.stdout.write(f'  User ||--o{{ PreventiveMaintenance (assigned_to FK)')
        
        self.stdout.write(self.style.SUCCESS('\n✓ Admin URLs:'))
        self.stdout.write(f'  Equipment: /admin/myappLubd/machine/{equipment.id}/change/')
        self.stdout.write(f'  Tasks: /admin/myappLubd/maintenanceprocedure/')
        if options['create_schedule']:
            self.stdout.write(f'  Schedules: /admin/myappLubd/preventivemaintenance/')


# Preventive Maintenance System - Complete Model Design

## Overview
This document describes the complete model structure for the Preventive Maintenance system, including all models, their relationships, and key features.

## Core Models

### 1. PreventiveMaintenance (Main Model)
**Purpose**: Central model for managing preventive maintenance tasks

**Key Fields**:
- `pm_id`: Unique identifier (auto-generated)
- `pmtitle`: Title of the maintenance task
- `procedure`: Detailed maintenance procedure text
- `scheduled_date`: When maintenance is scheduled
- `completed_date`: When maintenance was completed
- `frequency`: How often maintenance should occur
- `status`: Current status (pending, in_progress, completed, cancelled, overdue)
- `priority`: Priority level (low, medium, high, critical)
- `estimated_duration`: Estimated time in minutes
- `actual_duration`: Actual time taken
- `notes`: General notes about the task
- `completion_notes`: Notes about completion
- `quality_score`: Quality rating (1-10)
- `verified_by`: User who verified completion

**Relationships**:
- `topics`: Many-to-many with Topic
- `machines`: Many-to-many with Machine
- `created_by`: ForeignKey to User
- `completed_by`: ForeignKey to User
- `verified_by`: ForeignKey to User
- `procedure_template`: ForeignKey to MaintenanceProcedure

### 2. Machine
**Purpose**: Represents equipment that requires maintenance

**Key Fields**:
- `machine_id`: Unique identifier (auto-generated)
- `name`: Machine name
- `description`: Machine description
- `location`: Where the machine is located
- `status`: Current status (active, maintenance, repair, inactive, retired)
- `installation_date`: When machine was installed
- `last_maintenance_date`: Last maintenance performed

**Relationships**:
- `property`: ForeignKey to Property
- `preventive_maintenances`: Many-to-many with PreventiveMaintenance

### 3. Topic
**Purpose**: Categories for organizing maintenance tasks

**Key Fields**:
- `id`: Primary key
- `title`: Topic name
- `description`: Topic description

**Relationships**:
- `preventive_maintenances`: Many-to-many with PreventiveMaintenance

## Enhanced Procedure Management Models

### 4. MaintenanceProcedure
**Purpose**: Template procedures for maintenance tasks

**Key Fields**:
- `name`: Procedure name
- `description`: Detailed description
- `steps`: JSON field with step-by-step instructions
- `estimated_duration`: Estimated time in minutes
- `required_tools`: Tools needed for the procedure
- `safety_notes`: Safety considerations

**Relationships**:
- `maintenance_tasks`: Reverse relationship to PreventiveMaintenance

### 5. MaintenanceChecklist
**Purpose**: Checklist items for maintenance tasks

**Key Fields**:
- `maintenance`: ForeignKey to PreventiveMaintenance
- `item`: Checklist item description
- `description`: Detailed description
- `is_completed`: Whether item is completed
- `completed_by`: User who completed the item
- `completed_at`: When item was completed
- `order`: Display order

**Relationships**:
- `maintenance`: ForeignKey to PreventiveMaintenance
- `completed_by`: ForeignKey to User

### 6. MaintenanceHistory
**Purpose**: Track all actions performed on maintenance tasks

**Key Fields**:
- `maintenance`: ForeignKey to PreventiveMaintenance
- `action`: Action performed (started, completed, rescheduled, etc.)
- `notes`: Additional notes about the action
- `performed_by`: User who performed the action
- `timestamp`: When the action occurred

**Relationships**:
- `maintenance`: ForeignKey to PreventiveMaintenance
- `performed_by`: ForeignKey to User

### 7. MaintenanceSchedule
**Purpose**: Manage recurring maintenance schedules

**Key Fields**:
- `maintenance`: OneToOne with PreventiveMaintenance
- `is_recurring`: Whether maintenance repeats
- `next_occurrence`: Next scheduled occurrence
- `recurrence_pattern`: JSON field with recurrence rules
- `last_occurrence`: Last occurrence
- `total_occurrences`: Total times performed
- `is_active`: Whether schedule is active

**Relationships**:
- `maintenance`: OneToOne with PreventiveMaintenance

## Model Relationships Diagram

```
User (created_by, completed_by, verified_by)
    ↓
PreventiveMaintenance ←→ Topic (Many-to-Many)
    ↓                    ↓
Machine (Many-to-Many)  MaintenanceProcedure
    ↓                    ↓
Property                 MaintenanceChecklist
                         ↓
                    MaintenanceHistory
                         ↓
                    MaintenanceSchedule
```

## Key Features

### 1. Procedure Management
- **Text Procedures**: Simple text-based procedures in `PreventiveMaintenance.procedure`
- **Template Procedures**: Structured procedures using `MaintenanceProcedure` model
- **Step-by-Step**: JSON-based step tracking in `MaintenanceProcedure.steps`
- **Checklists**: Task-specific checklists with `MaintenanceChecklist`

### 2. Status Tracking
- **Multiple Statuses**: pending, in_progress, completed, cancelled, overdue
- **Priority Levels**: low, medium, high, critical
- **Progress Tracking**: estimated vs actual duration
- **Quality Control**: quality scoring and verification

### 3. Scheduling & Recurrence
- **Flexible Frequencies**: daily, weekly, monthly, quarterly, semi-annual, annual, custom
- **Recurring Schedules**: Automatic next due date calculation
- **Custom Patterns**: JSON-based recurrence patterns
- **Overdue Detection**: Automatic overdue status detection

### 4. Documentation & Images
- **Before/After Images**: Image capture for maintenance tasks
- **JPEG Conversion**: Automatic JPEG conversion for PDF compatibility
- **Image Processing**: Automatic resizing and optimization
- **File Management**: Organized file storage with date-based paths

### 5. History & Audit
- **Action Tracking**: Complete history of all maintenance actions
- **User Attribution**: Track who performed each action
- **Timestamps**: Detailed timing information
- **Audit Trail**: Complete audit trail for compliance

## API Endpoints

### Main Endpoints
- `GET /api/v1/preventive-maintenance/` - List all maintenance tasks
- `POST /api/v1/preventive-maintenance/` - Create new maintenance task
- `GET /api/v1/preventive-maintenance/{pm_id}/` - Get specific task
- `PUT /api/v1/preventive-maintenance/{pm_id}/` - Update task
- `DELETE /api/v1/preventive-maintenance/{pm_id}/` - Delete task

### Special Endpoints
- `GET /api/v1/preventive-maintenance/stats/` - Get statistics
- `GET /api/v1/preventive-maintenance/upcoming/` - Get upcoming tasks
- `GET /api/v1/preventive-maintenance/overdue/` - Get overdue tasks
- `POST /api/v1/preventive-maintenance/{pm_id}/complete/` - Mark as completed
- `POST /api/v1/preventive-maintenance/{pm_id}/upload-images/` - Upload images

## Usage Examples

### Creating a Maintenance Task
```python
maintenance = PreventiveMaintenance.objects.create(
    pmtitle="Monthly Equipment Inspection",
    procedure="1. Check all moving parts\n2. Lubricate bearings\n3. Test safety systems",
    scheduled_date=timezone.now() + timezone.timedelta(days=30),
    frequency='monthly',
    priority='medium',
    estimated_duration=120
)
```

### Adding a Checklist
```python
checklist_item = MaintenanceChecklist.objects.create(
    maintenance=maintenance,
    item="Check oil levels",
    description="Verify all oil reservoirs are at proper levels",
    order=1
)
```

### Recording History
```python
history = MaintenanceHistory.objects.create(
    maintenance=maintenance,
    action="started",
    performed_by=user,
    notes="Beginning monthly inspection"
)
```

## Migration Notes

When implementing these models:

1. **Run migrations**: `python manage.py makemigrations` and `python manage.py migrate`
2. **Update serializers**: Ensure all new fields are included in API responses
3. **Update admin**: Register new models in Django admin
4. **Test relationships**: Verify all foreign key and many-to-many relationships work correctly
5. **Update frontend**: Ensure TypeScript interfaces match the new model structure

## Future Enhancements

1. **Workflow Engine**: Add state machine for maintenance workflows
2. **Notification System**: Email/SMS notifications for upcoming maintenance
3. **Mobile App**: Mobile-optimized interface for field workers
4. **Integration**: Connect with external maintenance management systems
5. **Analytics**: Advanced reporting and analytics dashboard
6. **IoT Integration**: Connect with IoT sensors for predictive maintenance

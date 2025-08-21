# Maintenance Procedure Steps - Usage Examples

## Overview
This document shows how to create, manage, and use step-by-step maintenance procedures with the new `MaintenanceProcedure` model.

## Step Structure
Each step in a maintenance procedure contains:

```json
{
  "step_number": 1,
  "title": "Safety Check",
  "description": "Ensure all safety equipment is in place and working",
  "estimated_time": 5,
  "required_tools": ["safety_glasses", "gloves"],
  "safety_warnings": ["Wear protective equipment", "Check emergency stop button"],
  "images": ["/media/safety_check.jpg"],
  "notes": "This step is critical for worker safety",
  "created_at": "2025-01-20T10:00:00Z",
  "updated_at": "2025-01-20T10:00:00Z"
}
```

## API Endpoints

### 1. Create a New Procedure
```bash
POST /api/v1/maintenance-procedures/
```

**Request Body:**
```json
{
  "name": "Monthly Pump Maintenance",
  "description": "Regular maintenance procedure for industrial pumps",
  "difficulty_level": "intermediate",
  "estimated_duration": 120,
  "required_tools": "Wrench set, lubricant, pressure gauge",
  "safety_notes": "Ensure pump is completely shut down before starting",
  "steps": [
    {
      "title": "Safety Preparation",
      "description": "Put on safety equipment and ensure pump is shut down",
      "estimated_time": 10,
      "required_tools": ["safety_glasses", "gloves", "lockout_tagout"],
      "safety_warnings": ["Never work on running pump", "Use lockout/tagout procedure"]
    },
    {
      "title": "Inspect Pump Housing",
      "description": "Check for cracks, leaks, or damage to pump housing",
      "estimated_time": 15,
      "required_tools": ["flashlight", "inspection_mirror"],
      "safety_warnings": ["Check for hot surfaces"]
    },
    {
      "title": "Check Bearings",
      "description": "Inspect bearing condition and lubricate if necessary",
      "estimated_time": 20,
      "required_tools": ["lubricant", "grease_gun"],
      "safety_warnings": ["Ensure pump is completely stopped"]
    },
    {
      "title": "Test Operation",
      "description": "Start pump and check for proper operation",
      "estimated_time": 15,
      "required_tools": ["pressure_gauge", "flow_meter"],
      "safety_warnings": ["Stand clear during startup", "Monitor for unusual sounds"]
    }
  ]
}
```

### 2. Add a New Step
```bash
POST /api/v1/maintenance-procedures/{id}/add_step/
```

**Request Body:**
```json
{
  "title": "Clean Filters",
  "description": "Remove and clean all pump filters",
  "estimated_time": 25,
  "required_tools": ["filter_wrench", "cleaning_solution"],
  "safety_warnings": ["Filters may contain hazardous materials"],
  "notes": "Replace filters if they are damaged"
}
```

### 3. Update a Step
```bash
PUT /api/v1/maintenance-procedures/{id}/update_step/
```

**Request Body:**
```json
{
  "step_number": 2,
  "title": "Inspect Pump Housing and Seals",
  "description": "Check for cracks, leaks, or damage to pump housing and all seals",
  "estimated_time": 20,
  "required_tools": ["flashlight", "inspection_mirror", "seal_inspection_tool"],
  "safety_warnings": ["Check for hot surfaces", "Inspect for chemical leaks"]
}
```

### 4. Delete a Step
```bash
DELETE /api/v1/maintenance-procedures/{id}/delete_step/?step_number=3
```

### 5. Reorder Steps
```bash
POST /api/v1/maintenance-procedures/{id}/reorder_steps/
```

**Request Body:**
```json
{
  "new_order": [1, 3, 2, 4, 5]
}
```

### 6. Validate Procedure
```bash
GET /api/v1/maintenance-procedures/{id}/validate_procedure/
```

**Response:**
```json
{
  "is_valid": true,
  "errors": [],
  "total_steps": 5,
  "total_estimated_time": 85
}
```

### 7. Duplicate Procedure
```bash
POST /api/v1/maintenance-procedures/{id}/duplicate/
```

**Request Body:**
```json
{
  "new_name": "Monthly Pump Maintenance - Extended Version"
}
```

## Python Code Examples

### Creating a Procedure Programmatically
```python
from myappLubd.models import MaintenanceProcedure
from django.utils import timezone

# Create procedure
procedure = MaintenanceProcedure.objects.create(
    name="Weekly Equipment Inspection",
    description="Basic weekly inspection for all equipment",
    difficulty_level="beginner",
    estimated_duration=60,
    required_tools="Basic inspection tools",
    safety_notes="Always follow safety protocols"
)

# Add steps
step1 = procedure.add_step({
    "title": "Visual Inspection",
    "description": "Look for obvious damage or wear",
    "estimated_time": 15,
    "required_tools": ["flashlight"],
    "safety_warnings": ["Ensure equipment is stopped"]
})

step2 = procedure.add_step({
    "title": "Check Operation",
    "description": "Test basic functions",
    "estimated_time": 20,
    "required_tools": ["test_equipment"],
    "safety_warnings": ["Follow startup procedures"]
})

step3 = procedure.add_step({
    "title": "Document Findings",
    "description": "Record all observations and issues",
    "estimated_time": 10,
    "required_tools": ["notebook", "camera"],
    "safety_warnings": []
})

print(f"Procedure created with {procedure.get_steps_count()} steps")
print(f"Total estimated time: {procedure.get_total_estimated_time()} minutes")

# Validate procedure
is_valid, errors = procedure.validate_steps()
if is_valid:
    print("Procedure is valid!")
else:
    print("Validation errors:", errors)
```

### Managing Steps
```python
# Get a specific step
step = procedure.get_step(2)
print(f"Step 2: {step['title']}")

# Update a step
procedure.update_step(2, {
    "title": "Check Operation and Safety",
    "description": "Test basic functions and verify safety systems",
    "estimated_time": 25,
    "required_tools": ["test_equipment", "safety_checklist"],
    "safety_warnings": ["Follow startup procedures", "Verify emergency stops"]
})

# Delete a step
procedure.delete_step(3)
print(f"Steps remaining: {procedure.get_steps_count()}")

# Reorder steps
procedure.reorder_steps([1, 2, 4, 5])
```

### Using with Preventive Maintenance
```python
from myappLubd.models import PreventiveMaintenance

# Create maintenance task using procedure template
maintenance = PreventiveMaintenance.objects.create(
    pmtitle="Weekly Pump Inspection",
    scheduled_date=timezone.now() + timezone.timedelta(days=7),
    frequency='weekly',
    procedure_template=procedure,  # Link to procedure template
    procedure=procedure.get_formatted_procedure(),  # Get formatted procedure text
    estimated_duration=procedure.get_total_estimated_time(),
    priority='medium'
)

# Get procedure steps for the maintenance task
if maintenance.procedure_template:
    steps = maintenance.procedure_template.steps
    print(f"Maintenance task has {len(steps)} steps:")
    for step in steps:
        print(f"  {step['step_number']}. {step['title']} ({step['estimated_time']} min)")
```

## Frontend Integration

### TypeScript Interface
```typescript
interface MaintenanceStep {
  step_number: number;
  title: string;
  description: string;
  estimated_time: number;
  required_tools?: string[];
  safety_warnings?: string[];
  images?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface MaintenanceProcedure {
  id: number;
  name: string;
  description: string;
  steps: MaintenanceStep[];
  steps_count: number;
  total_estimated_time: number;
  estimated_duration: number;
  required_tools: string;
  safety_notes: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  is_valid_procedure: boolean;
  created_at: string;
  updated_at: string;
}
```

### React Component Example
```tsx
import React, { useState, useEffect } from 'react';

interface ProcedureStepsProps {
  procedureId: number;
}

const ProcedureSteps: React.FC<ProcedureStepsProps> = ({ procedureId }) => {
  const [procedure, setProcedure] = useState<MaintenanceProcedure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProcedure();
  }, [procedureId]);

  const fetchProcedure = async () => {
    try {
      const response = await fetch(`/api/v1/maintenance-procedures/${procedureId}/`);
      const data = await response.json();
      setProcedure(data);
    } catch (error) {
      console.error('Error fetching procedure:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!procedure) return <div>Procedure not found</div>;

  return (
    <div className="procedure-steps">
      <h2>{procedure.name}</h2>
      <p>{procedure.description}</p>
      
      <div className="procedure-info">
        <span>Difficulty: {procedure.difficulty_level}</span>
        <span>Total Steps: {procedure.steps_count}</span>
        <span>Estimated Time: {procedure.total_estimated_time} minutes</span>
      </div>

      <div className="steps-list">
        {procedure.steps.map((step) => (
          <div key={step.step_number} className="step-item">
            <div className="step-header">
              <h3>Step {step.step_number}: {step.title}</h3>
              <span className="time">{step.estimated_time} min</span>
            </div>
            
            <p className="description">{step.description}</p>
            
            {step.required_tools && step.required_tools.length > 0 && (
              <div className="tools">
                <strong>Tools:</strong> {step.required_tools.join(', ')}
              </div>
            )}
            
            {step.safety_warnings && step.safety_warnings.length > 0 && (
              <div className="safety">
                <strong>Safety:</strong>
                <ul>
                  {step.safety_warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {step.notes && (
              <div className="notes">
                <strong>Notes:</strong> {step.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProcedureSteps;
```

## Best Practices

### 1. Step Design
- **Clear Titles**: Use descriptive, action-oriented titles
- **Detailed Descriptions**: Include all necessary information
- **Realistic Time Estimates**: Base on actual experience
- **Safety First**: Always include relevant safety warnings
- **Tool Requirements**: List all necessary tools and equipment

### 2. Procedure Organization
- **Logical Flow**: Arrange steps in logical order
- **Group Related Steps**: Combine related activities
- **Checkpoints**: Include verification steps
- **Troubleshooting**: Add common problem solutions

### 3. Validation
- **Required Fields**: Ensure all steps have essential information
- **Time Consistency**: Verify total time matches individual steps
- **Safety Coverage**: Check that safety warnings are comprehensive
- **Tool Verification**: Confirm all required tools are listed

### 4. Maintenance
- **Regular Updates**: Keep procedures current with equipment changes
- **User Feedback**: Incorporate operator suggestions
- **Version Control**: Track changes and improvements
- **Training**: Ensure all users understand procedures

## Troubleshooting

### Common Issues
1. **Steps Not Saving**: Check required fields (title, description, estimated_time)
2. **Validation Errors**: Verify all step data is complete
3. **Permission Issues**: Ensure user has proper authentication
4. **API Errors**: Check request format and required parameters

### Debug Tips
- Use the validation endpoint to check procedure integrity
- Check Django admin for data consistency
- Verify serializer field mappings
- Test with simple step data first

This comprehensive step-by-step system provides a robust foundation for managing maintenance procedures with full CRUD operations, validation, and flexible step management.

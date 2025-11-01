# Maintenance Procedures - Backend Guide

## Overview
Maintenance procedures provide reusable, step-by-step templates that engineering and property teams can attach to preventive maintenance jobs. Each procedure stores rich metadata (steps, safety guidance, tooling, difficulty) in the `MaintenanceProcedure` model and is exposed over `/api/v1/maintenance-procedures/` for the frontend or integrations. This guide explains how to work with those endpoints, manage steps, and keep the experience friendly for operators.

## Quick Start

### Create from Django Admin
- Navigate to **Maintenance > Maintenance Procedures**.
- Click **Add maintenance procedure**.
- Fill in the core details (name, description, estimated duration, tools, safety notes).
- Enter the `steps` JSON (see schema below) or start with a single step and edit later.
- Save the procedure. Steps can be added or edited directly in the JSON field or via the API.

### Create via API (cURL)
```bash
curl -X POST https://pcms.live/api/v1/maintenance-procedures/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly Pump Maintenance",
    "description": "Regular maintenance procedure for industrial pumps",
    "difficulty_level": "intermediate",
    "estimated_duration": 120,
    "required_tools": "Wrench set, lubricant, pressure gauge",
    "safety_notes": "Ensure pump is completely shut down before starting",
    "steps": [
      {
        "title": "Safety Preparation",
        "description": "Put on safety equipment and ensure pump is locked out",
        "estimated_time": 10,
        "required_tools": ["PPE kit", "lockout tagout"],
        "safety_warnings": ["Never work on a running pump"]
      },
      {
        "title": "Inspect Pump Housing",
        "description": "Check for cracks, leaks, or damage to pump housing",
        "estimated_time": 15,
        "required_tools": ["flashlight", "inspection_mirror"]
      }
    ]
  }'
```

## Access and Permissions
- All endpoints require an authenticated user (`IsAuthenticated`).
- Creating, updating, deleting, or modifying steps is limited to staff or superusers. Non-admin users can list and read procedures as shared templates.
- Procedures are global; they are not scoped per property.

## Core Data Model
- `name` (string, required) - Friendly procedure name.
- `description` (text, required) - Purpose and background.
- `steps` (JSON, default empty list) - Ordered step definitions.
- `estimated_duration` (integer, minutes) - High-level duration for planning.
- `required_tools` (text) - Free-form list of tools or equipment.
- `safety_notes` (text) - Additional safety considerations.
- `difficulty_level` (enum: beginner, intermediate, advanced, expert).
- `created_at` / `updated_at` (timestamps).

### Step JSON Structure
```json
{
  "step_number": 1,
  "title": "Safety Check",
  "description": "Ensure all safety equipment is in place and working",
  "estimated_time": 5,
  "required_tools": ["safety_glasses", "gloves"],
  "safety_warnings": ["Wear protective equipment"],
  "images": ["/media/safety_check.jpg"],
  "notes": "This step is critical for worker safety",
  "created_at": "2025-01-20T10:00:00Z",
  "updated_at": "2025-01-20T10:00:00Z"
}
```
`step_number`, `created_at`, and `updated_at` are auto-managed when using the helper methods (`add_step`, `update_step`, etc.).

## API Quick Reference
| Method | Endpoint | Description | Admin Only? |
|--------|----------|-------------|-------------|
| GET | `/api/v1/maintenance-procedures/` | List procedures (search, filter, paginate) | No |
| POST | `/api/v1/maintenance-procedures/` | Create a new procedure | Yes |
| GET | `/api/v1/maintenance-procedures/{id}/` | Retrieve detailed procedure | No |
| PUT/PATCH | `/api/v1/maintenance-procedures/{id}/` | Update procedure metadata or steps | Yes |
| DELETE | `/api/v1/maintenance-procedures/{id}/` | Delete a procedure | Yes |
| POST | `/api/v1/maintenance-procedures/{id}/add_step/` | Append a new step | Yes |
| PUT | `/api/v1/maintenance-procedures/{id}/update_step/` | Update an existing step | Yes |
| DELETE | `/api/v1/maintenance-procedures/{id}/delete_step/?step_number=X` | Remove a step | Yes |
| POST | `/api/v1/maintenance-procedures/{id}/reorder_steps/` | Reorder steps | Yes |
| GET | `/api/v1/maintenance-procedures/{id}/validate_procedure/` | Validate steps and totals | No |
| POST | `/api/v1/maintenance-procedures/{id}/duplicate/` | Duplicate with a new name | Yes |
| GET | `/api/v1/maintenance-procedures/by_difficulty/` | Aggregate counts and average duration by difficulty | No |
| GET | `/api/v1/maintenance-procedures/search_by_tools/?tool=...` | Find procedures by tools string | No |

## Common Workflows

### List and Filter
```bash
curl -H "Authorization: Bearer <token>" \
  "https://pcms.live/api/v1/maintenance-procedures/?search=pump&difficulty_level=intermediate"
```
The list view uses `MaintenanceProcedureListSerializer`, returning `steps_count`, `total_estimated_time`, and `estimated_duration` for quick comparison.

### Retrieve a Procedure
```bash
curl -H "Authorization: Bearer <token>" \
  https://pcms.live/api/v1/maintenance-procedures/42/
```
The detail view includes the full `steps` payload and validation metadata (`is_valid_procedure`).

### Create or Update
- POST and PUT accept the model fields listed above.
- When providing `steps`, validation enforces `title`, `description`, and positive `estimated_time` for each step.
- When updating, omitting the `steps` field leaves existing steps unchanged; provide a full list to replace them entirely.

### Duplicate an Existing Procedure
```bash
curl -X POST https://pcms.live/api/v1/maintenance-procedures/42/duplicate/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"new_name": "Monthly Pump Maintenance - Extended"}'
```
The duplicate inherits all steps, notes, and difficulty level. Adjust fields with a subsequent update if needed.

### Group by Difficulty
```bash
curl -H "Authorization: Bearer <token>" \
  "https://pcms.live/api/v1/maintenance-procedures/by_difficulty/?difficulty=advanced"
```
Returns counts and average durations per difficulty to help balance workloads.

## Step Management Endpoints

### Add Step
```bash
curl -X POST https://pcms.live/api/v1/maintenance-procedures/42/add_step/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Clean Filters",
    "description": "Remove and clean all filters",
    "estimated_time": 25,
    "required_tools": ["filter_wrench", "cleaning_solution"],
    "notes": "Replace filters if damaged"
  }'
```
`step_number`, `created_at`, and `updated_at` are assigned automatically.

### Update Step
```bash
curl -X PUT https://pcms.live/api/v1/maintenance-procedures/42/update_step/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "step_number": 2,
    "title": "Inspect Pump Housing and Seals",
    "description": "Check housing, seals, and nearby fittings",
    "estimated_time": 20,
    "required_tools": ["flashlight", "inspection_mirror", "torque_wrench"]
  }'
```

### Delete Step
```bash
curl -X DELETE "https://pcms.live/api/v1/maintenance-procedures/42/delete_step/?step_number=3" \
  -H "Authorization: Bearer <token>"
```

### Reorder Steps
```bash
curl -X POST https://pcms.live/api/v1/maintenance-procedures/42/reorder_steps/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"new_order": [1,3,2,4]}'
```
The backend renumbers steps sequentially after reordering.

### Validate Procedure
```bash
curl -H "Authorization: Bearer <token>" \
  https://pcms.live/api/v1/maintenance-procedures/42/validate_procedure/
```
Response example:
```json
{
  "is_valid": true,
  "errors": [],
  "total_steps": 4,
  "total_estimated_time": 70
}
```
Use this before publishing a procedure or linking it to a job.

## Validation and Quality Checks
- Serializer-level validation ensures each step includes `title`, `description`, and positive `estimated_time`.
- `is_valid_procedure` (detail serializer) reports overall status.
- `validate_steps()` returns `(True, "No steps defined")` when the procedure is empty. That is acceptable for draft templates.
- `get_total_estimated_time()` sums each step's `estimated_time`; keep it close to `estimated_duration` for planning accuracy.

## Using Procedures in Preventive Maintenance
```python
from django.utils import timezone
from myappLubd.models import MaintenanceProcedure, PreventiveMaintenance

procedure = MaintenanceProcedure.objects.get(name="Monthly Pump Maintenance")

procedure_text = "\n".join(
    f"{step['step_number']}. {step['title']} - {step['description']}"
    for step in procedure.steps
)

maintenance = PreventiveMaintenance.objects.create(
    pmtitle="Monthly Pump Inspection",
    scheduled_date=timezone.now() + timezone.timedelta(days=30),
    frequency="monthly",
    priority="medium",
    procedure_template=procedure,
    procedure=procedure_text,
    estimated_duration=procedure.get_total_estimated_time()
)

print(f"Linked template with {maintenance.procedure_template.get_steps_count()} steps")
```

Linking the template lets technicians see the structured steps while still keeping a text snapshot inside the maintenance record.

## Django Admin Tips
- Columns show name, estimated duration, and timestamps for quick sorting.
- Use search to locate templates by name or description.
- Steps are edited as raw JSON. Use the API for granular step edits if manual editing feels risky.
- Read-only fields (`created_at`, `updated_at`) provide accountability for change history.

## Frontend Integration

### TypeScript Interfaces
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

### React Snippet
```tsx
import React, { useEffect, useState } from 'react';

const ProcedureSteps: React.FC<{ procedureId: number }> = ({ procedureId }) => {
  const [procedure, setProcedure] = useState<MaintenanceProcedure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProcedure = async () => {
      try {
        const response = await fetch(`/api/v1/maintenance-procedures/${procedureId}/`);
        setProcedure(await response.json());
      } finally {
        setLoading(false);
      }
    };

    fetchProcedure();
  }, [procedureId]);

  if (loading) return <div>Loading...</div>;
  if (!procedure) return <div>Procedure not found</div>;

  return (
    <div>
      <h2>{procedure.name}</h2>
      <p>{procedure.description}</p>
      <div>
        <span>Difficulty: {procedure.difficulty_level}</span>
        <span>Total Steps: {procedure.steps_count}</span>
        <span>Estimated Time: {procedure.total_estimated_time} min</span>
      </div>
      {procedure.steps.map((step) => (
        <section key={step.step_number}>
          <header>
            <h3>Step {step.step_number}: {step.title}</h3>
            <span>{step.estimated_time} min</span>
          </header>
          <p>{step.description}</p>
          {step.required_tools?.length && <p><strong>Tools:</strong> {step.required_tools.join(', ')}</p>}
          {step.safety_warnings?.length && (
            <ul>
              {step.safety_warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {step.notes && <p><strong>Notes:</strong> {step.notes}</p>}
        </section>
      ))}
    </div>
  );
};

export default ProcedureSteps;
```

## Make It Friendly for Operators
- Speak their language: write titles and descriptions as technician actions ("Check pressure relief valve" instead of "Valve inspection").
- Surface safety early: add a dedicated first step for lockout or tagout if needed.
- Keep steps short: aim for 3 to 7 items per procedure; split long instructions into smaller steps.
- Use tools consistently: align `required_tools` values with the vocabulary used on checklists or inventory systems.
- Leverage difficulty levels: mix beginner or intermediate tasks for onboarding; reserve advanced or expert work for certified technicians.
- Duplicate then tweak: use the duplicate endpoint to create variants for specific machine models.

## Troubleshooting and Debugging
- Steps not saving? Confirm required fields (`title`, `description`, `estimated_time`) are present and positive.
- Validation errors? Call `/validate_procedure/` to see missing fields and aggregate timing issues.
- Permission denied? Only staff or superusers can mutate procedures or steps.
- Serializer mismatches? Ensure frontend payloads send arrays for `required_tools` and `safety_warnings` when using the nested serializer.
- Data drift? Use the Django admin to spot-check JSON or log the payload before sending to the API.

## Related Services
- `MaintenanceProcedureService` wraps creation, filtering by difficulty, and tool searches for reuse in other modules.
- `MaintenanceProcedureViewSet` (in `views.py`) exposes the actions documented above.
- `MaintenanceProcedureSerializer` enforces validation and exposes friendly computed fields (`steps_count`, `total_estimated_time`).

With these patterns in place, the maintenance procedures module supports authoring, validating, and executing reusable workflows while keeping both admins and technicians productive.

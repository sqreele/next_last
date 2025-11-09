# Maintenance Task Image Guide

## 📸 Overview

The `MaintenanceTaskImage` model stores before/after images for maintenance tasks. This allows you to document the condition of equipment before and after maintenance work.

## 🗄️ Model Structure

```
MaintenanceTaskImage
├── id (PK)
├── task_id (FK → MaintenanceTask)
├── image_type (Enum: "Before" | "After")
├── image_url (ImageField)
├── jpeg_path (auto-generated for PDF)
├── uploaded_at (DateTime, auto)
└── uploaded_by (FK → User, optional)
```

## 🚀 Apply Migration

```bash
docker exec django-backend-dev python3 /app/src/manage.py migrate
```

## 📊 Django Admin

### Access
- URL: http://localhost:8000/admin/myappLubd/maintenancetaskimage/

### Features
- ✅ Image preview in list view
- ✅ Large image preview in detail view
- ✅ Filter by image type (Before/After)
- ✅ Search by task name or equipment
- ✅ Auto-resizes images to 800x800px
- ✅ Auto-generates JPEG version for PDFs

### Add Images
1. Go to **Maintenance Task Images** in admin
2. Click **Add Maintenance Task Image**
3. Select **Task** (or use search icon)
4. Select **Image Type**: Before or After
5. Upload **Image**
6. **Uploaded by**: (optional) select user
7. Click **Save**

## 💻 Django Shell Examples

### Upload Before/After Images for a Task

```bash
docker exec django-backend-dev python3 /app/src/manage.py shell
```

```python
from myappLubd.models import MaintenanceProcedure, MaintenanceTaskImage
from django.core.files import File
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()

# Get a maintenance task
task = MaintenanceProcedure.objects.get(name='Weekly Fire Pump Testing')

# Upload a before image
with open('/path/to/before_image.jpg', 'rb') as f:
    before_img = MaintenanceTaskImage.objects.create(
        task=task,
        image_type='before',
        image_url=File(f, name='fire_pump_before.jpg'),
        uploaded_by=user
    )
    print(f"✓ Uploaded before image: {before_img.id}")

# Upload an after image
with open('/path/to/after_image.jpg', 'rb') as f:
    after_img = MaintenanceTaskImage.objects.create(
        task=task,
        image_type='after',
        image_url=File(f, name='fire_pump_after.jpg'),
        uploaded_by=user
    )
    print(f"✓ Uploaded after image: {after_img.id}")
```

### Get Images for a Task

```python
from myappLubd.models import MaintenanceProcedure

task = MaintenanceProcedure.objects.get(name='Weekly Fire Pump Testing')

# Get all images for this task
images = task.task_images.all()
print(f"Task: {task.name}")
print(f"Images: {images.count()}")

for img in images:
    print(f"\n  {img.image_type.title()}")
    print(f"    URL: {img.image_url.url}")
    print(f"    Uploaded: {img.uploaded_at}")
    print(f"    By: {img.uploaded_by.username if img.uploaded_by else 'Unknown'}")
```

### Get Before/After Images Separately

```python
# Get only "before" images
before_images = task.task_images.filter(image_type='before')

# Get only "after" images
after_images = task.task_images.filter(image_type='after')

# Get latest before image
latest_before = task.task_images.filter(
    image_type='before'
).order_by('-uploaded_at').first()

print(f"Latest before image: {latest_before.image_url.url if latest_before else 'None'}")
```

### Get Images by Equipment

```python
from myappLubd.models import Machine

equipment = Machine.objects.get(name='Electric Fire Pump')

# Get all task images for this equipment
all_images = MaintenanceTaskImage.objects.filter(
    task__equipment=equipment
).select_related('task', 'uploaded_by')

print(f"Equipment: {equipment.name}")
print(f"Total images: {all_images.count()}")

for img in all_images:
    print(f"\n  Task: {img.task.name}")
    print(f"  Type: {img.image_type}")
    print(f"  Uploaded: {img.uploaded_at}")
```

## 🔌 API Examples

### POST - Upload Image

```bash
curl -X POST http://localhost:8000/api/v1/maintenance-task-images/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "task=1" \
  -F "image_type=before" \
  -F "image_url=@/path/to/image.jpg"
```

### GET - List All Images

```bash
curl http://localhost:8000/api/v1/maintenance-task-images/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "count": 2,
  "results": [
    {
      "id": 1,
      "task": 1,
      "task_name": "Weekly Fire Pump Testing",
      "equipment_name": "Electric Fire Pump",
      "image_type": "before",
      "image_url": "/media/maintenance_task_images/2025/11/image.jpg",
      "image_url_full": "http://localhost:8000/media/maintenance_task_images/2025/11/image.jpg",
      "uploaded_at": "2025-11-08T10:00:00Z",
      "uploaded_by": 1,
      "uploaded_by_username": "john.engineer"
    }
  ]
}
```

### GET - Images for Specific Task

```bash
curl "http://localhost:8000/api/v1/maintenance-task-images/?task=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GET - Only Before Images

```bash
curl "http://localhost:8000/api/v1/maintenance-task-images/?image_type=before" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### GET - Only After Images

```bash
curl "http://localhost:8000/api/v1/maintenance-task-images/?image_type=after" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📱 Frontend Integration

### TypeScript Interface

```typescript
interface MaintenanceTaskImage {
  id: number;
  task: number;
  task_name: string;
  equipment_name: string;
  image_type: 'before' | 'after';
  image_url: string;
  image_url_full: string;
  uploaded_at: string;
  uploaded_by: number | null;
  uploaded_by_username: string | null;
}
```

### React Component Example

```tsx
import React, { useState, useEffect } from 'react';

interface TaskImagesProps {
  taskId: number;
}

const TaskImages: React.FC<TaskImagesProps> = ({ taskId }) => {
  const [images, setImages] = useState<MaintenanceTaskImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/maintenance-task-images/?task=${taskId}`)
      .then(res => res.json())
      .then(data => {
        setImages(data.results);
        setLoading(false);
      });
  }, [taskId]);

  if (loading) return <div>Loading...</div>;

  const beforeImages = images.filter(img => img.image_type === 'before');
  const afterImages = images.filter(img => img.image_type === 'after');

  return (
    <div className="task-images">
      <div className="before-images">
        <h3>Before</h3>
        {beforeImages.map(img => (
          <div key={img.id} className="image-card">
            <img src={img.image_url_full} alt="Before" />
            <p>Uploaded: {new Date(img.uploaded_at).toLocaleDateString()}</p>
            <p>By: {img.uploaded_by_username || 'Unknown'}</p>
          </div>
        ))}
      </div>

      <div className="after-images">
        <h3>After</h3>
        {afterImages.map(img => (
          <div key={img.id} className="image-card">
            <img src={img.image_url_full} alt="After" />
            <p>Uploaded: {new Date(img.uploaded_at).toLocaleDateString()}</p>
            <p>By: {img.uploaded_by_username || 'Unknown'}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Upload Image Component

```tsx
const ImageUpload: React.FC<{ taskId: number }> = ({ taskId }) => {
  const [imageType, setImageType] = useState<'before' | 'after'>('before');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('task', taskId.toString());
    formData.append('image_type', imageType);
    formData.append('image_url', file);

    const response = await fetch('/api/v1/maintenance-task-images/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (response.ok) {
      alert('Image uploaded successfully!');
      // Refresh images list
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <select value={imageType} onChange={e => setImageType(e.target.value as 'before' | 'after')}>
        <option value="before">Before</option>
        <option value="after">After</option>
      </select>

      <input
        type="file"
        accept="image/*"
        onChange={e => setFile(e.target.files?.[0] || null)}
      />

      <button type="submit">Upload Image</button>
    </form>
  );
};
```

## 🎯 Use Cases

### 1. Document Maintenance Work

```python
# Before starting maintenance
task = MaintenanceProcedure.objects.get(id=1)

# Take before photo
before_img = MaintenanceTaskImage.objects.create(
    task=task,
    image_type='before',
    image_url=uploaded_file,
    uploaded_by=request.user
)

# ... perform maintenance ...

# Take after photo
after_img = MaintenanceTaskImage.objects.create(
    task=task,
    image_type='after',
    image_url=uploaded_file,
    uploaded_by=request.user
)
```

### 2. Compare Before/After

```python
def get_before_after_comparison(task_id, date=None):
    """Get before/after images for a task on a specific date"""
    filters = {'task_id': task_id}
    
    if date:
        filters['uploaded_at__date'] = date
    
    before = MaintenanceTaskImage.objects.filter(
        image_type='before',
        **filters
    ).order_by('-uploaded_at').first()
    
    after = MaintenanceTaskImage.objects.filter(
        image_type='after',
        **filters
    ).order_by('-uploaded_at').first()
    
    return {
        'before': before.image_url.url if before else None,
        'after': after.image_url.url if after else None,
        'date': date
    }
```

### 3. Generate Report with Images

```python
def generate_maintenance_report(task_id):
    """Generate maintenance report with before/after images"""
    task = MaintenanceProcedure.objects.get(id=task_id)
    images = task.task_images.all().order_by('image_type', '-uploaded_at')
    
    report = {
        'equipment': task.equipment.name,
        'task': task.name,
        'images': {
            'before': [],
            'after': []
        }
    }
    
    for img in images:
        report['images'][img.image_type].append({
            'url': img.image_url.url,
            'uploaded_at': img.uploaded_at,
            'uploaded_by': img.uploaded_by.username if img.uploaded_by else None
        })
    
    return report
```

## 🔧 Features

### Auto Image Processing
- ✅ Resizes images to max 800x800px
- ✅ Converts to RGB if needed
- ✅ Generates JPEG version for PDFs
- ✅ Optimizes file size

### Storage
- Images saved to: `media/maintenance_task_images/YYYY/MM/`
- JPEG versions for PDF generation
- Automatic cleanup on delete

### Validation
- Allowed formats: PNG, JPG, JPEG, GIF
- Max dimensions: 800x800px (auto-resized)

## 📝 Quick Commands

```bash
# Apply migration
docker exec django-backend-dev python3 /app/src/manage.py migrate

# Access Django admin
http://localhost:8000/admin/myappLubd/maintenancetaskimage/

# List images in shell
docker exec django-backend-dev python3 /app/src/manage.py shell -c "
from myappLubd.models import MaintenanceTaskImage
for img in MaintenanceTaskImage.objects.all():
    print(f'{img.id}: {img.task.name} - {img.image_type} ({img.uploaded_at})')
"
```

## 🎨 Admin Features

- **List View**: Shows task, type, preview, uploader, date
- **Detail View**: Large image preview
- **Filters**: By type, date, task
- **Search**: By task name or equipment name
- **Raw ID Fields**: For performance with many tasks

---

**Ready to use!** 📸

Run migration: `docker exec django-backend-dev python3 /app/src/manage.py migrate`


# Maintenance PDF Report Generation System

This system provides clean, compact, and professional PDF reports for maintenance activities. It's designed to be efficient, customizable, and easy to use.

## Features

### 📊 **Clean & Compact Design**
- Professional layout with consistent styling
- Optimized for readability and printing
- Compact mode for high-density information display
- Detailed mode for comprehensive reporting

### 🎨 **Professional Styling**
- Custom color-coded status indicators
- Professional fonts and typography
- Consistent header/footer on all pages
- Responsive table layouts

### 📋 **Comprehensive Content**
- Summary statistics dashboard
- Detailed maintenance task information
- Location and topic categorization
- Notes and procedure details
- Completion status tracking

### 🔍 **Advanced Filtering**
- Status-based filtering (completed, pending, overdue)
- Frequency filtering (daily, weekly, monthly, etc.)
- Date range filtering
- Topic and property filtering
- User access control

## Installation

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Required Packages
- `reportlab>=3.6.0` - PDF generation engine
- `Pillow>=8.0.0` - Image processing support
- `Django>=3.2` - Web framework

## Usage

### API Endpoint
```
GET /api/v1/maintenance/report/pdf/
```

### Query Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `type` | string | Report type: `detailed` or `compact` | `detailed` |
| `include_images` | boolean | Include images in report | `false` |
| `title` | string | Custom report title | `Maintenance Report` |
| `status` | string | Filter by status: `completed`, `pending`, `overdue` | All |
| `frequency` | string | Filter by frequency | All |
| `date_from` | date | Start date filter (YYYY-MM-DD) | None |
| `date_to` | date | End date filter (YYYY-MM-DD) | None |
| `topic_id` | integer | Filter by topic ID | All |
| `property_id` | string | Filter by property ID | All |

### Example API Calls

#### Basic Report
```bash
curl -X GET "http://localhost:8000/api/v1/maintenance/report/pdf/" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Compact Report
```bash
curl -X GET "http://localhost:8000/api/v1/maintenance/report/pdf/?type=compact" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Filtered Report
```bash
curl -X GET "http://localhost:8000/api/v1/maintenance/report/pdf/?type=detailed&status=pending&frequency=monthly" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Date Range Report
```bash
curl -X GET "http://localhost:8000/api/v1/maintenance/report/pdf/?date_from=2024-01-01&date_to=2024-12-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Report Types

### 1. Detailed Report (`type=detailed`)
- Full maintenance task details
- Individual sections for each task
- Comprehensive information display
- Professional layout with headers/footers
- Page breaks for optimal printing

### 2. Compact Report (`type=compact`)
- High-density table format
- Summary statistics
- Essential information only
- Single-page overview when possible
- Ideal for quick reference

## Report Content

### Summary Statistics
- Total tasks count
- Completed tasks
- Pending tasks
- Overdue tasks
- Completion rate percentage

### Task Information
- Task title and ID
- Status (with color coding)
- Scheduled and completion dates
- Frequency
- Location (rooms/properties)
- Associated topics
- Notes and procedures
- Estimated duration

### Status Color Coding
- 🟢 **Green**: Completed tasks
- 🟠 **Orange**: Pending tasks
- 🔴 **Red**: Overdue tasks
- 🔵 **Blue**: In-progress tasks
- ⚫ **Grey**: Cancelled tasks

## Code Examples

### Python Usage
```python
from myappLubd.pdf_utils import MaintenanceReportGenerator

# Create generator
generator = MaintenanceReportGenerator(
    title="Monthly Maintenance Report",
    include_images=False,
    compact_mode=True
)

# Generate compact report
output_stream = generator.generate_compact_report(maintenance_data)

# Save to file
with open('maintenance_report.pdf', 'wb') as f:
    f.write(output_stream.getvalue())
```

### Django View Integration
```python
from .pdf_utils import MaintenanceReportGenerator
from django.http import HttpResponse

def generate_report(request):
    # Get maintenance data
    maintenance_data = PreventiveMaintenance.objects.all()
    
    # Create generator
    generator = MaintenanceReportGenerator(title="Custom Report")
    
    # Generate PDF
    output_stream = generator.generate_report(maintenance_data)
    
    # Return response
    response = HttpResponse(
        output_stream.getvalue(),
        content_type='application/pdf'
    )
    response['Content-Disposition'] = 'attachment; filename="report.pdf"'
    return response
```

## Testing

### Run Test Script
```bash
cd backend/myLubd
python test_pdf_generation.py
```

This will create test data and generate sample PDFs:
- `test_detailed_report.pdf`
- `test_compact_report.pdf`

### Test API Endpoint
```bash
# Start Django server
python manage.py runserver

# Test with curl
curl -X GET "http://localhost:8000/api/v1/maintenance/report/pdf/?type=compact" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o test_api_report.pdf
```

## Customization

### Styling
Modify the `_create_styles()` method in `MaintenanceReportGenerator` to customize:
- Fonts and sizes
- Colors and themes
- Spacing and margins
- Table styles

### Content
Customize report content by modifying:
- `_create_summary_table()` - Summary statistics
- `_create_maintenance_item()` - Individual task display
- `_create_header_footer()` - Page headers/footers

### Layout
Adjust layout by modifying:
- Page sizes and margins
- Table column widths
- Spacing between elements
- Page break logic

## Performance Considerations

### Optimization Tips
1. **Use compact mode** for large datasets
2. **Limit date ranges** when possible
3. **Filter by status** to reduce data volume
4. **Use property filtering** for focused reports

### Memory Usage
- Reports are generated in memory using BytesIO
- Large datasets may require chunked processing
- Consider streaming for very large reports

## Troubleshooting

### Common Issues

#### Missing Dependencies
```bash
pip install reportlab Pillow
```

#### Import Errors
Ensure Django environment is properly configured:
```python
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()
```

#### PDF Generation Fails
Check:
- Data availability
- User permissions
- File write permissions
- Memory availability

### Debug Mode
Enable debug logging:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Security

### Access Control
- Reports respect user property access
- Staff users can access all data
- Regular users see only their property data

### Data Validation
- Input parameters are validated
- SQL injection protection
- XSS protection through proper escaping

## Future Enhancements

### Planned Features
- [ ] Image inclusion support
- [ ] Custom branding options
- [ ] Multiple export formats
- [ ] Scheduled report generation
- [ ] Email delivery
- [ ] Report templates

### Contributing
To add new features:
1. Extend `MaintenanceReportGenerator` class
2. Add new report types
3. Update API endpoints
4. Add tests
5. Update documentation

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the test examples
3. Check Django logs for errors
4. Verify data availability and permissions

---

**Note**: This system requires Django 3.2+ and Python 3.8+. Ensure all dependencies are properly installed before use.

MACHINE_CATEGORIES = (
    'PM', 'Repair', 'Preventive Monthly', 'Preventive Weekly',
    'Preventive Yearly', 'Change Part', 'Service Contract', 'Other',
)


def machine_category_flags(category):
    if category not in MACHINE_CATEGORIES:
        raise ValueError('Select a machine work category from the demo list.')
    return {
        'is_preventivemaintenance': category == 'PM' or category.startswith('Preventive '),
        'is_defective': category == 'Repair',
    }

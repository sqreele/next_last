from django import template

register = template.Library()

@register.filter(name='replace')
def replace(value, arg):
    """
    Replace occurrences of a substring with another substring.
    Usage: {{ value|replace:"old,new" }}
    """
    if not value:
        return value
    
    try:
        old, new = arg.split(',', 1)
        return value.replace(old, new)
    except ValueError:
        # If arg doesn't contain a comma, return original value
        return value

@register.filter(name='underscore_to_space')
def underscore_to_space(value):
    """
    Replace underscores with spaces.
    Usage: {{ value|underscore_to_space }}
    """
    if not value:
        return value
    return value.replace('_', ' ')
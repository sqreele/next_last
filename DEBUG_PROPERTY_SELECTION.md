# Troubleshooting Property Hydration

## Symptom

The header property selector remains in `Loading...` or shows `No Properties`
after authentication.

## Expected Data Flow

- `/api/v1/user-profiles/me/` supplies the canonical `currentUser` identity and
  its scoped property DTOs. The meanings of `user_id`, `profile_id`, and the
  Auth0 subject remain distinct.
- `/api/v1/properties/` supplies a backend-authorized compatibility list used
  by `session.user.properties` for UI hydration.
- When canonical profile properties are present, `StoreProvider` uses them.
- When the profile request is unavailable or its property list is empty,
  `StoreProvider` may use only the current session's authorized property list.
- The fallback does not grant backend access. Backend authorization remains the
  enforcement boundary for every request.
- A selected property restored from local storage is discarded when it is not
  in the newly hydrated list.

The code must never infer access from a URL parameter, property name, stale
local storage, or an unscoped global property collection.

## Safe Investigation

1. Inspect `/api/auth/session-compat` in the browser Network panel. Confirm that
   `currentUser` retains the canonical profile response and that
   `user.properties` contains only properties returned by authenticated backend
   endpoints.
2. Run the read-only Django diagnostic command from the backend directory:

   ```bash
   python manage.py debug_user_properties <username>
   ```

3. Compare the command's `get_accessible_properties` result with its
   UserProfile, legacy `Property.users`, and active TenantMembership sections.
4. Check server logs with the existing API debug flag enabled if either backend
   request failed.

Example session shape:

```json
{
  "user": {
    "properties": [
      { "property_id": "PROP-123", "name": "Hotel A" }
    ]
  },
  "currentUser": {
    "user_id": 41,
    "profile_id": 83,
    "properties": [
      { "property_id": "PROP-123", "name": "Hotel A" }
    ]
  }
}
```

An empty `currentUser.properties` with populated `user.properties` can be a
valid temporary fallback state. An empty list in both locations should produce
the safe `No Properties` UI after loading completes.

## Resolution Procedure

If the diagnostic output shows no accessible properties, escalate to the
tenant/property administrator to review the intended assignment through the
normal administrative workflow. Do not patch memberships directly in a Django
shell and do not add frontend authorization exceptions.

After correcting configuration, sign out and back in or refresh the session,
then verify that the selector contains only the expected authorized properties.

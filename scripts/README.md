# Start development environment
./scripts/dev.sh

# Start in background
./scripts/dev.sh -d

# Force rebuild
./scripts/dev.sh -r

# Clean and rebuild
./scripts/dev.sh -c -r

# Show help
./scripts/dev.sh -h

# Stop services
./scripts/dev-stop.sh

# View logs
./scripts/dev-logs.sh
./scripts/dev-logs.sh

# Access shells
./scripts/dev-shell.sh frontend
./scripts/dev-shell.sh backend
./scripts/dev-shell.sh db

# Reset everything
./scripts/dev-reset.sh

# Delete development user
./scripts/delete-developer-user.sh

# Fix fixture files (remove invalid 'images' field from Job model)
python3 scripts/fix_fixture_images_field.py <input_file> <output_file>
python3 scripts/fix_all_fixtures.py <directory>

# Example:
python3 scripts/fix_fixture_images_field.py backend/myLubd/src/backup_3.json backend/myLubd/src/backup_3_fixed.json
python3 scripts/fix_all_fixtures.py backend/myLubd/src/
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
./scripts/dev-logs.sh frontend
./scripts/dev-logs.sh backend

# Access shells
./scripts/dev-shell.sh frontend
./scripts/dev-shell.sh backend
./scripts/dev-shell.sh db

# Reset everything
./scripts/dev-reset.sh
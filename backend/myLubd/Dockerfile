
FROM python:3.9


# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DJANGO_SETTINGS_MODULE=myLubd.settings
ENV PYTHONPATH=/app

WORKDIR /app

# Install system dependencies (include image libs for Pillow WebP/JPEG)
RUN apt-get update && apt-get install -y \
    postgresql-client \
    netcat-traditional \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    libwebp-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY ./src .

# Set up entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]


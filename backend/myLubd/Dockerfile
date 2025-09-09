
FROM python:3.9


# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DJANGO_SETTINGS_MODULE=myLubd.settings
ENV PYTHONPATH=/app
ENV TZ=Asia/Bangkok

WORKDIR /app

# Install system dependencies (include image libs for Pillow WebP/JPEG) and cron
RUN apt-get update && apt-get install -y \
    postgresql-client \
    netcat-traditional \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    libwebp-dev \
    libpng-dev \
    cron \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Configure timezone
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

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


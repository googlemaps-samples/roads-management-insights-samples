# Stage 1: Build the React frontend
FROM node:20-slim AS build-ui
WORKDIR /app/ui

# Copy only package files first to leverage layer caching
COPY ui/package.json ui/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend files and build
COPY ui/ ./
RUN npm run build

# Stage 2: Build the Python backend
FROM python:3.12-slim
WORKDIR /app

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=2.0.1 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1

# Add poetry to PATH
ENV PATH="$POETRY_HOME/bin:$PATH"

# Install system build dependencies and GDAL
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gdal-bin \
    libgdal-dev \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN curl -sSL https://install.python-poetry.org | python3 -

# Copy poetry files separately for better caching
COPY pyproject.toml poetry.lock ./

# Install backend dependencies
RUN poetry install --no-root --only main

# Copy only the necessary backend files
COPY server/ ./server/
# COPY README.md ./ # If needed by poetry, but we used --no-root

# Copy the built frontend from Stage 1
COPY --from=build-ui /app/ui/dist ./ui/dist

# Expose the port
EXPOSE 8080

# Run the application
CMD uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8080}

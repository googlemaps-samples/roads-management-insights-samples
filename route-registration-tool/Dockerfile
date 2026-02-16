# Stage 1: Build the React frontend
FROM node:20-slim AS build-ui
WORKDIR /app/ui
# Copy all files from ui/
COPY ./ui /app/ui
RUN npm install
RUN npm run build

# Copy the package-lock.json file to the correct location
COPY ui/package-lock.json /app/ui/package-lock.json


# Stage 2: Build the Python backend
FROM python:3.12-slim
WORKDIR /app

# Install poetry
RUN pip install poetry

# Copy poetry files
COPY pyproject.toml poetry.lock ./

# Install GDAL and system build dependencies
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN poetry lock
RUN poetry install --no-root --only main

# Copy the rest of the application
COPY . .

# Copy the built frontend
COPY --from=build-ui /app/ui/dist ./ui/dist

# Copy the package-lock.json to the backend directory
COPY --from=build-ui /app/ui/package-lock.json ./ui/package-lock.json

# Expose the port and run the application
EXPOSE 8080
CMD poetry run uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8080}

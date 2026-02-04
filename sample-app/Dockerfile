# Stage 1: Build the React frontend
FROM node:20-slim AS build-ui
WORKDIR /app/ui
COPY ui/ ./

# Stage 2: Build the Python backend
FROM python:3.12-slim
WORKDIR /app

# Install poetry
RUN pip install poetry

# Copy poetry files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry install --no-root --only main

# Copy the rest of the application
COPY . .

# Copy the built frontend
COPY --from=build-ui /app/ui/dist ./ui/dist

# Expose the port and run the application
EXPOSE 8080
CMD poetry run uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
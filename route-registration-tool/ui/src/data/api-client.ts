// API Configuration
const API_BASE_URL = import.meta.env.PROD ? "" : "http://localhost:8000"

// HTTP Client
export class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      // Try to parse JSON error response, but handle HTML responses (e.g., 404 pages)
      let errorData: any = {}
      const contentType = response.headers.get("content-type")
      if (contentType && contentType.includes("application/json")) {
        try {
          errorData = await response.json()
        } catch {
          // If JSON parsing fails, use empty object
        }
      } else {
        // For non-JSON responses (like HTML), try to get text for better error message
        try {
          const text = await response.text()
          if (text.includes("<!doctype") || text.includes("<html")) {
            errorData = { detail: `Endpoint not found: ${endpoint}` }
          }
        } catch {
          // If text parsing also fails, use empty object
        }
      }
      // FastAPI returns { detail: "..." }, other APIs might use { error: "..." }
      const errorMessage =
        errorData.detail ||
        errorData.error ||
        `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get("content-type")
    if (contentType && !contentType.includes("application/json")) {
      throw new Error(`Expected JSON response but got ${contentType}`)
    }

    return response.json()
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" })
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" })
  }

  async uploadFile<T>(
    endpoint: string,
    file: File,
    formData?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const uploadFormData = new FormData()
    uploadFormData.append("file", file)

    if (formData) {
      Object.entries(formData).forEach(([key, value]) => {
        uploadFormData.append(key, value)
      })
    }

    const response = await fetch(url, {
      method: "POST",
      body: uploadFormData,
      // Don't set Content-Type header - browser will set it with boundary
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage =
        errorData.detail ||
        errorData.error ||
        `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    return response.json()
  }

  async downloadFile(
    endpoint: string,
  ): Promise<{ blob: Blob; filename: string }> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      method: "GET",
    })

    if (!response.ok) {
      // Try to parse JSON error response
      let errorData: any = {}
      const contentType = response.headers.get("content-type")
      if (contentType && contentType.includes("application/json")) {
        try {
          errorData = await response.json()
        } catch {
          // If JSON parsing fails, use empty object
        }
      }
      const errorMessage =
        errorData.detail ||
        errorData.error ||
        `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers.get("content-disposition")
    let filename = ""
    if (contentDisposition) {
      // Try multiple patterns to extract filename
      // Pattern 1: filename="value" or filename='value'
      let match = contentDisposition.match(/filename[^;=\n]*=(["'])([^"']+)\1/i)
      if (match && match[2]) {
        filename = match[2]
      } else {
        // Pattern 2: filename=value (without quotes)
        match = contentDisposition.match(/filename[^;=\n]*=([^;\n]+)/i)
        if (match && match[1]) {
          filename = match[1].trim()
        }
      }
      // Debug logging
      if (!filename) {
        console.warn(
          "Could not extract filename from Content-Disposition:",
          contentDisposition,
        )
      }
    }

    const blob = await response.blob()
    return { blob, filename }
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
export { API_BASE_URL }

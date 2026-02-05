/**
 * GeoJSON upload component with file drag-drop and paste functionality
 */
import { CheckCircle, CloudUpload } from "@mui/icons-material"
import { Box, Typography } from "@mui/material"
import { useRef } from "react"

import { GeoJsonUploadState } from "../../types/region-creation"

interface GeoJsonUploaderProps {
  state: GeoJsonUploadState
  onFileUpload: (file: File) => void
  onDownloadSample: () => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export default function GeoJsonUploader({
  state,
  onFileUpload,
  onDownloadSample,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: GeoJsonUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0])
    }
  }

  const handleUploadAreaClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Typography variant="body2" className="font-semibold text-sm">
          Jurisdiction Boundary
        </Typography>
        <Box className="flex flex-col gap-1">
          <Typography variant="caption" className="text-mui-secondary text-xs">
            Upload a GeoJSON file that defines the geographic boundary of your
            jurisdiction.
          </Typography>
          <Typography variant="caption" className="text-mui-secondary text-xs">
            This boundary will be used to filter and monitor traffic within the
            specified area.
          </Typography>
        </Box>
        <Box className="flex items-center gap-2"></Box>
      </div>

      <div className="space-y-2 p-2 bg-gray-50/30 rounded">
        {/* Upload Area Only */}
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={handleUploadAreaClick}
          className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-all ${
            state.dragActive
              ? "border-mui-primary bg-blue-50"
              : state.uploadedGeoJson
                ? "border-green-400 bg-green-50"
                : "border-gray-300 hover:border-gray-400 bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.geojson"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="space-y-2">
            {state.uploadedGeoJson ? (
              <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
            ) : (
              <CloudUpload className="w-5 h-5 text-gray-400 mx-auto" />
            )}
            <div>
              <p className="text-xs font-medium text-mui-primary">
                {state.uploadedGeoJson
                  ? "Uploaded Successfully"
                  : state.dragActive
                    ? "Drop here"
                    : "Upload Jurisdiction Boundary"}
              </p>
              <p className="text-xs text-mui-secondary">
                {state.uploadedGeoJson
                  ? "Upload or drop a new file to replace"
                  : ".geojson and .json files supported"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

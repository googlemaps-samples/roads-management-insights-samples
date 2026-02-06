// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Fullscreen,
  Link as LinkIcon,
} from "@mui/icons-material"
import { Box, Fade, IconButton, Link, Tooltip, Typography } from "@mui/material"
import { useState } from "react"
import { createPortal } from "react-dom"

import datasetNameGif from "../../assets/images/dataset-name.gif"
import projectInfoGif from "../../assets/images/project-info.gif"
import Button from "../../components/common/Button"
import { PRIMARY_BLUE, PRIMARY_BLUE_DARK } from "../../constants/colors"
import { downloadSampleGeoJson } from "../../utils/geojson-validation"

interface HelpPanelProps {
  step: number // 0 = GCP, 1 = Dataset Name, 2 = Project Name, 3 = Jurisdiction Boundary
  minimized: boolean
  onToggleMinimize: () => void
}

export default function HelpPanel({
  step,
  minimized,
  onToggleMinimize,
}: HelpPanelProps) {
  const [isGifHovered, setIsGifHovered] = useState(false)

  return (
    <Box
      className="absolute right-0 top-16 h-full flex transition-all duration-300 z-[1000]"
      sx={{
        width: minimized ? 0 : { xs: "100%", sm: 400 },
        fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
        transform: minimized ? "translateX(100%)" : "translateX(0)",
        position: "relative",
      }}
    >
      {/* Main Panel */}
      <Box
        className="flex flex-col border-l border-gray-200 bg-white h-full"
        sx={{
          width: minimized ? 0 : { xs: "100%", sm: 400 },
          position: "relative",
          zIndex: 1000,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          className="flex items-center justify-between p-4 border border-gray-200"
          sx={{ flexShrink: 0 }}
        >
          <Typography
            variant="h6"
            className="text-base"
            sx={{ fontWeight: 600, color: "#000000" }}
          >
            Help & Guidelines
          </Typography>
        </Box>

        {/* Content */}
        <Box
          className="overflow-x-visible p-4 pretty-scrollbar"
          sx={{
            maxHeight: "calc(100vh - 120px)",
            overflowY: "auto",
          }}
        >
          <Box className="space-y-4">
            {/* Conditional Content Based on Step */}
            {step === 0 && (
              <>
                {/* GIF Section */}
                <Box
                  className="flex justify-center relative"
                  sx={{
                    overflow: "visible",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    width: "100%",
                    "&:hover .fullscreen-button": {
                      opacity: 1,
                    },
                  }}
                >
                  <img
                    src={projectInfoGif}
                    alt="Setup Instructions"
                    className="w-full h-auto cursor-pointer"
                    style={{
                      position: "relative",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                      display: "block",
                      borderRadius: "12px",
                    }}
                    onClick={() => setIsGifHovered(true)}
                  />
                  <Tooltip title="View fullscreen" placement="top">
                    <IconButton
                      className="fullscreen-button"
                      onClick={() => setIsGifHovered(true)}
                      sx={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.9)",
                        backdropFilter: "blur(4px)",
                        opacity: 0,
                        transition: "opacity 0.2s",
                        zIndex: 1002,
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 1)",
                        },
                      }}
                    >
                      <Fullscreen sx={{ fontSize: "18px", color: "#000000" }} />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Google Cloud Project Info */}
                <Box
                  sx={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 600,
                      color: "#000000",
                      fontSize: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    Google Cloud Project Setup
                  </Typography>
                  <Typography
                    variant="body2"
                    className="mb-3"
                    sx={{
                      fontWeight: 400,
                      color: "#000000",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    Your Google Cloud Project will be used for BigQuery data
                    storage and traffic subscription.{" "}
                    <Link
                      href={`https://console.cloud.google.com/home/dashboard`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: "#1976d2",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        verticalAlign: "middle",
                        gap: "2px",
                        marginLeft: "2px",
                        "&:hover": {
                          textDecoration: "underline",
                          color: PRIMARY_BLUE_DARK,
                        },
                      }}
                    >
                      <LinkIcon
                        sx={{
                          fontSize: "14px",
                          verticalAlign: "middle",
                          display: "inline-block",
                        }}
                      />
                    </Link>
                  </Typography>
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 400,
                      color: "#000000",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    If you don't see your project in the list, make sure:
                  </Typography>
                  <Box className="space-y-2">
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        1.
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        You're logged in via 'gcloud auth application-default
                        login' in your terminal
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        2.
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Cloud Resource Manager API is enabled{" "}
                        <Link
                          href={`https://console.cloud.google.com/apis/api/cloudresourcemanager.googleapis.com/metrics`}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            color: PRIMARY_BLUE,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            verticalAlign: "middle",
                            gap: "2px",
                            marginLeft: "2px",
                            "&:hover": {
                              textDecoration: "underline",
                              color: PRIMARY_BLUE_DARK,
                            },
                          }}
                        >
                          <LinkIcon
                            sx={{
                              fontSize: "14px",
                              verticalAlign: "middle",
                              display: "inline-block",
                            }}
                          />
                        </Link>
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        3.
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        You have the necessary permissions
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </>
            )}

            {step === 1 && (
              <>
                {/* GIF Section */}
                <Box
                  className="flex justify-center relative"
                  sx={{
                    overflow: "visible",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    width: "100%",
                    "&:hover .fullscreen-button": {
                      opacity: 1,
                    },
                  }}
                >
                  <img
                    src={datasetNameGif}
                    alt="Dataset Name Instructions"
                    className="w-full h-auto cursor-pointer"
                    style={{
                      position: "relative",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                      display: "block",
                      borderRadius: "12px",
                    }}
                    onClick={() => setIsGifHovered(true)}
                  />
                  <Tooltip title="View fullscreen" placement="top">
                    <IconButton
                      className="fullscreen-button"
                      onClick={() => setIsGifHovered(true)}
                      sx={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.9)",
                        backdropFilter: "blur(4px)",
                        opacity: 0,
                        transition: "opacity 0.2s",
                        zIndex: 1002,
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 1)",
                        },
                      }}
                    >
                      <Fullscreen sx={{ fontSize: "18px", color: "#000000" }} />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Dataset Name Info */}
                <Box
                  sx={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 600,
                      color: "#000000",
                      fontSize: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    Dataset Name
                  </Typography>
                  <Typography
                    variant="body2"
                    className="mb-3"
                    sx={{
                      fontWeight: 400,
                      color: "#000000",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    The BigQuery dataset name where your traffic data will be
                    stored. This dataset will contain tables for route status
                    and historical traffic data.
                  </Typography>
                  <Box className="space-y-2">
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Must contain only letters, numbers, and underscores
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Default value is "historical_roads_data" which can be
                        customized
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        This dataset must exist in your Google Cloud Project or
                        will be created during sync
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </>
            )}

            {step === 2 && (
              <>
                {/* Project Name Info */}
                <Box
                  sx={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 600,
                      color: "#000000",
                      fontSize: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    Project Name
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 400,
                      color: "#000000",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    Choose a unique name for your project. This name will be
                    used to identify your project in the dashboard and must be
                    unique.
                  </Typography>
                </Box>
              </>
            )}

            {step === 3 && (
              <>
                {/* Jurisdiction Boundary Info */}
                <Box
                  sx={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 600,
                      color: "#000000",
                      fontSize: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    Jurisdiction Boundary
                  </Typography>
                  <Box className="space-y-2">
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        A jurisdiction boundary is the geographic area (polygon)
                        that defines the region where you want to monitor
                        traffic. This could be a city, county, state, or any
                        custom geographic area.
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        This boundary will be used to filter and monitor traffic
                        within the specified area.
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        This should be the same file you subscribed to in the
                        Google Cloud Project.
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* GeoJSON Format Requirements */}
                <Box
                  sx={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <Typography
                    variant="body2"
                    className="mb-2"
                    sx={{
                      fontWeight: 600,
                      color: "#000000",
                      fontSize: "16px",
                      lineHeight: 1.5,
                    }}
                  >
                    File Format Requirements
                  </Typography>
                  <Box className="space-y-2.5 mb-4">
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Must be a valid GeoJSON FeatureCollection or Feature
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Should contain a single Polygon feature
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        Coordinates must be in [longitude, latitude] format
                        (WGS84)
                      </Typography>
                    </Box>
                    <Box
                      className="flex gap-3"
                      sx={{
                        padding: "4px 0",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: PRIMARY_BLUE,
                          fontSize: "14px",
                          flexShrink: 0,
                          minWidth: "20px",
                        }}
                      >
                        •
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 400,
                          color: "#000000",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
                      >
                        File extension: .geojson or .json
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<Download className="w-3 h-3" />}
                    onClick={downloadSampleGeoJson}
                    sx={{
                      fontSize: "14px",
                      padding: "6px 12px",
                      color: "#1976d2",
                      "&:hover": {
                        backgroundColor: "#e3f2fd",
                        color: "#1565c0",
                      },
                    }}
                  >
                    Download Sample File
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* Toggle Button - Always visible, positioned on left edge */}
      <Box
        className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 bg-white border border-l-0 border-b-0 border-t-0 border-gray-300 rounded-l-lg flex items-center justify-center cursor-pointer transition-all duration-200 z-[999] pr-4"
        onClick={onToggleMinimize}
        sx={{
          width: 40, // w-10 = 40px
          height: 64, // h-16 = 64px
          boxShadow: minimized
            ? "0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(66, 133, 244, 0.1)"
            : "0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)",
          backgroundColor: minimized ? "#f8f9fa" : "#ffffff",
          "&:hover": {
            backgroundColor: minimized ? "#ffffff" : "#f8f9fa",
            boxShadow: minimized
              ? "0 6px 20px rgba(0, 0, 0, 0.25), 0 3px 10px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(66, 133, 244, 0.15)"
              : "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)",
          },
        }}
      >
        {minimized ? (
          <ChevronLeft
            sx={{
              fontSize: 22,
              fontWeight: 600,
              color: "#000000",
            }}
          />
        ) : (
          <ChevronRight
            className="pr-1"
            sx={{
              fontSize: 22,
              color: "#000000",
            }}
          />
        )}
      </Box>

      {/* Full-Screen GIF Overlay - Appears on click */}
      {isGifHovered &&
        typeof document !== "undefined" &&
        createPortal(
          <Fade in={isGifHovered} timeout={300}>
            <Box
              className="fixed inset-0 flex items-center justify-center z-[2000]"
              sx={{
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
              }}
              onClick={() => setIsGifHovered(false)}
            >
              <Box
                className="max-w-[90vw] max-h-[90vh] flex items-center justify-center p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={step === 0 ? projectInfoGif : datasetNameGif}
                  alt="Help illustration - enlarged"
                  className="max-w-full max-h-full rounded-lg shadow-2xl"
                  style={{ objectFit: "contain" }}
                />
              </Box>
            </Box>
          </Fade>,
          document.body,
        )}
    </Box>
  )
}

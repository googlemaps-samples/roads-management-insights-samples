// Copyright 2025 Google LLC
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

import { Menu } from "@mui/icons-material"
import { Box } from "@mui/material"
import { styled } from "@mui/material/styles"
import React, { useEffect, useRef, useState } from "react"

import googleLogo from "../assets/images/google-maps-platform.svg"

const HeaderContainer = styled(Box)({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  backgroundColor: "#ffffff",
  zIndex: 1000,
  borderBottom: "1px solid #e8eaed",
})

const ImageContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  backgroundColor: "transparent",
})

const TopBar = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 15px 10px 9px",
  backgroundColor: "#fff",
  height: "64px",
})

const TopRight = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "16px",

  "@media (max-width: 768px)": {
    display: "none",
  },
})

const MobileTopRight = styled(Box)({
  display: "none",
  alignItems: "center",
  gap: "12px",
  "@media (max-width: 768px)": {
    display: "flex",
  },
})

const SearchContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  position: "relative",
  transition: "all 0.3s ease",
})

const SearchIcon = styled("div")({
  cursor: "pointer",
  padding: "6px",
  borderRadius: "50%",
  "&:hover": {
    backgroundColor: "#f1f3f4",
  },
})

const SearchInput = styled("input")({
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: "14px",
  width: "0px",
  opacity: 0,
  transition: "all 0.3s ease",
  paddingLeft: "40px",
  "&.expanded": {
    width: "320px",
    opacity: 1,
    padding: "8px 40px",
    border: "2px solid #1a73e8",
    borderRadius: "20px",
    backgroundColor: "#fff",
  },
  "@media (max-width: 768px)": {
    "&.expanded": {
      width: "100%",
      maxWidth: "none",
    },
  },
})

const SearchIconInside = styled("div")({
  position: "absolute",
  left: "10px",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 1,
  display: "none",
  "&.visible": {
    display: "block",
  },
})

const ClearButton = styled("button")({
  position: "absolute",
  right: "8px",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "&:hover": {
    backgroundColor: "#f1f3f4",
  },
})

const OutlinedButton = styled("button")({
  boxShadow: "0 0 0 1px #dadce0",
  background: "#fff",
  color: "#1a73e8",
  borderRadius: "999px",
  padding: "8px 20px",
  fontWeight: 500,
  fontFamily: "Google Sans, Product Sans, sans-serif",
  fontSize: "16px",
  lineHeight: "24px",
  height: "48px",
  cursor: "pointer",
  ":hover": {
    color: "#174ea6",
    backgroundColor: "rgba(26, 115, 232, .04)",
    boxShadow: "0 0 0 1px #1a73e8",
  },
  ":active": {
    color: "#174ea6",
    backgroundColor: "rgba(26, 115, 232, .1)",
    boxShadow: "0 0 0 1px #1a73e8",
  },
  ":focus": {
    color: "#174ea6",
    backgroundColor: "rgba(26, 115, 232, .12)",
    boxShadow: "0 0 0 1px #1a73e8",
  },
  "@media (max-width: 768px)": {
    padding: "6px 12px",
    fontSize: "14px",
  },
})

const FilledButton = styled("button")({
  background: "#1a73e8",
  color: "#fff",
  border: "none",
  borderRadius: "999px",
  padding: "8px 20px",
  fontWeight: 500,
  fontFamily: "Google Sans, Product Sans, sans-serif",
  fontSize: "16px",
  cursor: "pointer",
  boxShadow: "none",
  lineHeight: "24px",
  height: "48px",
  ":hover": {
    backgroundColor: "#185abc",
    color: "#fff",
  },
  ":active": {
    backgroundColor: "#185abc",
    color: "#fff",
  },
  ":focus": {
    backgroundColor: "#185abc",
    color: "#fff",
    boxShadow:
      "0px 1px 2px rgba(60, 64, 67, .3), 0px 1px 4px rgba(60, 64, 67, .25)",
  },
  "@media (max-width: 768px)": {
    padding: "6px 12px",
    fontSize: "14px",
  },
})

const SearchSVG = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    fill="none"
    {...props}
  >
    <mask
      id="a"
      width={24}
      height={24}
      x={0}
      y={0}
      maskUnits="userSpaceOnUse"
      style={{
        maskType: "alpha",
      }}
    >
      <path fill="#D9D9D9" d="M0 0h24v24H0z" />
    </mask>
    <g mask="url(#a)">
      <path
        fill="#3C4043"
        d="m19.6 21-6.3-6.3A6.096 6.096 0 0 1 9.5 16c-1.817 0-3.354-.63-4.612-1.887C3.629 12.854 3 11.317 3 9.5c0-1.817.63-3.354 1.888-4.612C6.146 3.629 7.683 3 9.5 3c1.817 0 3.354.63 4.613 1.888C15.37 6.146 16 7.683 16 9.5a6.096 6.096 0 0 1-1.3 3.8l6.3 6.3-1.4 1.4ZM9.5 14c1.25 0 2.313-.438 3.188-1.313C13.562 11.813 14 10.75 14 9.5c0-1.25-.438-2.313-1.313-3.188C11.813 5.438 10.75 5 9.5 5c-1.25 0-2.313.438-3.188 1.313S5 8.25 5 9.5c0 1.25.438 2.313 1.313 3.188C7.188 13.562 8.25 14 9.5 14Z"
      />
    </g>
  </svg>
)

const Header: React.FC = () => {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null)

  const handleSearchClick = () => {
    setIsSearchExpanded(true)
  }

  // TODO: Implement mobile search
  // const handleMobileSearchClick = () => {
  //   setIsMobileSearchActive(true)
  // }

  const handleSearchSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      const searchUrl = `https://mapsplatform.google.com/search/?q=${encodeURIComponent(searchQuery.trim())}`
      window.location.href = searchUrl
      setSearchQuery("")
      setIsSearchExpanded(false)
      setIsMobileSearchActive(false)
    }
  }

  const handleBlur = () => {
    setIsSearchExpanded(false)
  }

  // Handle click outside search containers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      // Close desktop search if clicking outside
      if (
        isSearchExpanded &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setIsSearchExpanded(false)
        setSearchQuery("")
      }

      // Close mobile search if clicking outside
      if (
        isMobileSearchActive &&
        mobileSearchContainerRef.current &&
        !mobileSearchContainerRef.current.contains(target)
      ) {
        setIsMobileSearchActive(false)
        setSearchQuery("")
      }
    }

    // Add event listener
    document.addEventListener("mousedown", handleClickOutside)

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isSearchExpanded, isMobileSearchActive])

  return (
    <HeaderContainer>
      <TopBar>
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              display: "none",
              "@media (max-width: 768px)": {
                display: "block",
                px: 1,
              },
            }}
          >
            <Menu />
          </Box>
          <ImageContainer>
            <img
              src={googleLogo}
              alt="Google Logo"
              style={{ width: "256px", height: "auto" }}
            />
          </ImageContainer>
        </Box>

        {/* Desktop Search and Buttons */}
        <TopRight>
          <SearchContainer ref={searchContainerRef}>
            <SearchInput
              type="text"
              placeholder="Search Google Maps Platform"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchSubmit}
              onBlur={handleBlur}
              className={isSearchExpanded ? "expanded" : ""}
            />
            {isSearchExpanded && (
              <SearchIconInside className="visible">
                <SearchSVG width="20" height="20" fill="none" />
              </SearchIconInside>
            )}
            {isSearchExpanded && (
              <ClearButton
                onClick={() => {
                  setSearchQuery("")
                  setIsSearchExpanded(false)
                }}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 4L4 12M4 4L12 12"
                    stroke="#5f6368"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ClearButton>
            )}
            {!isSearchExpanded && (
              <SearchIcon onClick={handleSearchClick}>
                <SearchSVG width="24" height="24" fill="none" />
              </SearchIcon>
            )}
          </SearchContainer>
          <OutlinedButton>
            <a
              href="https://mapsplatform.google.com/contact-us/"
              rel="noopener noreferrer"
            >
              Contact sales
            </a>
          </OutlinedButton>
          <FilledButton>
            <a
              href="https://console.cloud.google.com/google/maps-apis/start?ref=https%3A%2F%2Fmapsplatform.google.com&amp;hl=en_in&amp;utm_referrer=http%3A%2F%2Flocalhost%3A5173%2F&amp;_gl=1*az0swa*_ga*MTk3MjIzNTc5OC4xNzQ5NzAxODA2*_ga_NRWSTWS78N*czE3NTI4MzMxOTMkbzMxJGcxJHQxNzUyODM1MTAxJGo2MCRsMCRoMA.."
              rel="noopener noreferrer"
              target="_blank"
            >
              Get started
            </a>
          </FilledButton>
        </TopRight>

        {/* Mobile - Only show on desktop */}
        <MobileTopRight>
          {/* Empty on mobile - everything moves to second line */}
        </MobileTopRight>
      </TopBar>

      {/* Mobile Search Bar */}
    </HeaderContainer>
  )
}

export default Header

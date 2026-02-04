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

import { Box, Button, Fade, Typography } from "@mui/material"
import { keyframes, styled } from "@mui/material/styles"
import React, { lazy } from "react"

const Map3DBackground = lazy(() => import("./3d-map"))

const fadeInScale = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(30px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
`

const slideInUp = keyframes`
  0% {
    opacity: 0;
    transform: translateY(40px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`

const ExploreButton = styled(Button)(({ theme }) => ({
  backgroundColor: "#1a73e8",
  color: "#ffffff",
  fontFamily: "Google Sans, sans-serif",
  fontSize: "1rem",
  fontWeight: 400,
  padding: "12px 24px",
  borderRadius: "4px",
  textTransform: "none",
  boxShadow: "0 2px 8px rgba(26, 115, 232, 0.3)",
  border: "none",
  position: "relative",
  overflow: "hidden",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  "& .MuiButton-startIcon": {
    marginRight: "8px",
    fontSize: "18px",
  },
  "&:hover": {
    backgroundColor: "#1557b0",
    boxShadow: "0 4px 16px rgba(26, 115, 232, 0.4)",
    transform: "translateY(-2px) scale(1.02)",
  },
  "&:active": {
    transform: "translateY(-1px) scale(1.01)",
  },
  [theme.breakpoints.down("md")]: {
    fontSize: "12px",
    padding: "10px 20px",
    "& .MuiButton-startIcon": {
      marginRight: "6px",
      fontSize: "16px",
    },
  },
  [theme.breakpoints.down("sm")]: {
    fontSize: "10px",
    padding: "6px 12px",
    "& .MuiButton-startIcon": {
      marginRight: "3px",
      fontSize: "14px",
    },
  },
}))

const ContentWrapper = styled(Box)({
  paddingRight: "32px",
})

const TitleText = styled(Typography)(({ theme }) => ({
  fontSize: "56px",
  fontWeight: 400,
  color: theme.palette.common.white,
  marginBottom: "32px",
  whiteSpace: "pre-line",
  display: "inline-block",
  animation: `${fadeInScale} 0.6s cubic-bezier(0.4, 0, 0.2, 1)`,
  [theme.breakpoints.down("md")]: {
    fontSize: "36px",
  },
}))

const SubtitleText = styled(Typography)(() => ({
  fontFamily: "Google Sans, Product Sans, sans-serif",
  fontSize: "18px",
  fontWeight: 400,
  color: "rgba(255, 255, 255, 0.9)",
  lineHeight: 1.5,
  marginBottom: "32px",
  maxWidth: "480px",
  textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
  animation: `${slideInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both`,
}))

const AnimatedButton = styled(ExploreButton)({
  animation: `${slideInUp} 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.6s both`,
})

// Clean Google-style components
const ContentContainer = styled(Box)({
  height: "100vh",
  position: "relative",
  "&::after": {
    content: '""',
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "linear-gradient(90deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.6) 40%, rgba(0, 0, 0, 0.2) 60%, rgba(0, 0, 0, 0.1) 80%)",
    zIndex: 1,
    "@media (max-width: 768px)": {
      background:
        "linear-gradient(90deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.6) 60%, rgba(0, 0, 0, 0.2) 90%, rgba(0, 0, 0, 0.1) 100%)",
    },
    pointerEvents: "none", // Allow interaction with map underneath
  },
})

const MainSection = styled(Box)({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  alignItems: "stretch",
  paddingLeft: "4em",
  zIndex: 3,
})

const LeftContent = styled(Box)({
  flex: 1,
  maxWidth: "600px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  position: "relative",
  zIndex: 4,
  marginTop: "80px", // Account for header height
})

const LandingPageContent: React.FC = () => {
  const handleExploreDemo = () => {
    window.location.href = "/demo" //update to use react router
  }

  return (
    <ContentContainer>
      <Map3DBackground />
      <MainSection>
        <LeftContent>
          <Fade in={true} timeout={600}>
            <ContentWrapper>
              {/* Title */}
              <TitleText variant="h1">
                Roads{"\n"}Management{"\n"}Insights
              </TitleText>

              {/* Subtitle */}
              <SubtitleText>
                Access Google's best-in-class road information to improve the
                safety and efficiency of road networks and make data-driven
                decisions
              </SubtitleText>

              {/* Button: Make it a custom button component */}
              <AnimatedButton onClick={handleExploreDemo}>
                Start exploring
              </AnimatedButton>
            </ContentWrapper>
          </Fade>
        </LeftContent>
      </MainSection>
    </ContentContainer>
  )
}

export default LandingPageContent

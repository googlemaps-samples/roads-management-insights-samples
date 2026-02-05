import { ChevronRightRounded, LocationOn } from "@mui/icons-material"
import { Card, CardActionArea, Typography } from "@mui/material"

import { Project } from "../../stores/project-workspace-store"

interface ProjectCardProps {
  project: Project & { routeCount?: number }
  onClick: () => void
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <Card
      elevation={0}
      className="border border-mui-divider rounded-lg transition-all duration-200 ease-out hover:border-mui-primary hover:shadow-[0_4px_12px_rgba(25,118,210,0.15)] hover:-translate-y-px"
    >
      <CardActionArea
        onClick={onClick}
        className="p-2 hover:[&_.MuiCardActionArea-focusHighlight]:opacity-0"
      >
        <div className="px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            {/* Location icon */}
            <LocationOn className="text-xl text-mui-primary transition-all duration-200 ease-in-out" />

            {/* Project info */}
            <div className="flex-1 min-w-0">
              <Typography
                variant="subtitle2"
                className="font-medium text-mui-primary overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {project.name}
              </Typography>
            </div>

            {/* Arrow indicator */}
            {project.routeCount !== undefined && (
              <Typography
                variant="caption"
                className="text-mui-disabled text-xs"
              >
                {project.routeCount} routes
              </Typography>
            )}
            <ChevronRightRounded className="text-mui-disabled text-xl transition-all duration-200 ease-in-out" />
          </div>
        </div>
      </CardActionArea>
    </Card>
  )
}

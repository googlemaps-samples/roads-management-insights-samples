import React from "react"

interface StretchRoadIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  /**
   * Color of the intersections and the central road block.
   */
  primaryColor?: string
  /**
   * Color of the action arrows (contrast).
   */
  accentColor?: string
}

export const StretchRoadIcon: React.FC<StretchRoadIconProps> = ({
  size = 24,
  primaryColor = "#1f2937", // Dark Gray / Black (Tailwind gray-800)
  accentColor = "#9ca3af", // Light Gray (Tailwind gray-400)
  className,
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* 
        1. Top Intersection Line 
        A solid bar representing the cross-street/limit ahead.
      */}
      <path
        d="M5 4H19"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* 
        2. Bottom Intersection Line 
        A solid bar representing the cross-street/limit behind.
      */}
      <path
        d="M5 20H19"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* 
        3. The Road Boundaries (The Context)
        Vertical lines defining the road width.
        We make these slightly thinner to emphasize the action inside.
      */}
      <path
        d="M8.5 7V17"
        stroke={accentColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.5 7V17"
        stroke={accentColor}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* 
        4. The "Stretch" Action Arrows
        These represent the road merging outwards. 
        They originate from the center and point directly to the intersection lines.
      */}
      <path
        d="M12 12V6" // Line Up
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6L9.5 8.5M12 6L14.5 8.5" // Arrow Head Up
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M12 12V18" // Line Down
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 18L9.5 15.5M12 18L14.5 15.5" // Arrow Head Down
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 
        5. Center Node (Optional anchor)
        A small dot in the middle to signify the origin of the action.
      */}
      <circle cx="12" cy="12" r="1.5" fill={primaryColor} />
    </svg>
  )
}

export default StretchRoadIcon

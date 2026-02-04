# Roads Management Insights UI

A React-based web application for visualizing real-time and historical traffic data with interactive 3D maps.

## Features

- **3D Interactive Maps**: Powered by Google Maps 3D API
- **Real-time Traffic Data**: Live traffic conditions and alerts
- **Historical Analysis**: Compare current vs historical traffic patterns
- **Responsive Design**: Works on desktop and mobile devices
- **Performance Optimized**: Fast loading with skeleton screens and lazy loading

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Maps API key

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit the `.env` file and add your Google Maps API key:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 3. Get a Google Maps API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Maps 3D API
   - Places API (if needed)
4. Create credentials (API Key)
5. Restrict the API key to your domain for security

### 4. Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

## Environment Variables

| Variable                   | Description              | Required |
| -------------------------- | ------------------------ | -------- |
| `VITE_GOOGLE_MAPS_API_KEY` | Your Google Maps API key | Yes      |

## Project Structure

```
src/
├── components/          # React components
│   ├── map/            # Map-related components
│   └── ...
├── data/               # Static data files
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
└── assets/             # Images and other assets
```

## Key Components

- **Map3DBackground**: 3D map with animated routes and alerts
- **DemoAppContent**: Main demo interface
- **LandingPageContent**: Landing page with 3D map background
- **GoogleMapsLoader**: Handles Google Maps API loading

## Performance Features

- **Skeleton Loading**: Shows loading state while 3D map initializes
- **Lazy Loading**: Components load on demand
- **Idle Callback**: Heavy operations deferred until browser is idle
- **Preloading**: Critical assets preloaded for faster startup

## Troubleshooting

### Google Maps API Issues

1. **API Key Not Working**: Ensure your API key is valid and has the correct permissions
2. **Quota Exceeded**: Check your Google Cloud Console for usage limits
3. **Domain Restrictions**: Make sure your domain is allowed in the API key settings

### Build Issues

1. **Environment Variable Missing**: Ensure `.env` file exists and contains `VITE_GOOGLE_MAPS_API_KEY`
2. **TypeScript Errors**: Run `npm run lint` to check for issues

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## Deployment

The application can be deployed to any static hosting service:

- **Vercel**: Automatic deployment from Git
- **Netlify**: Drag and drop deployment
- **GitHub Pages**: Free hosting for public repositories

Make sure to set the environment variable in your hosting platform's settings.

## License

This project is part of the Roads Management Insights demo.

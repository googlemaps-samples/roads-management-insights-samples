import { create } from 'zustand';
import { GeoJsonUploadState, FormState, RegionCreationFormData } from '../types/region-creation';

// Utility function to create detailed logs for store changes
const logStoreChange = (storeName: string, action: string, payload: any, newState: any) => {
  console.log(`🔄 [${storeName}] ${action}`, {
    timestamp: new Date().toISOString(),
    action,
    payload,
    newState: JSON.parse(JSON.stringify(newState)), // Deep clone to avoid reference issues
  });
};

interface ProjectCreationStore {
  // GeoJSON upload state for project creation
  geoJsonState: GeoJsonUploadState;
  
  // Form state for project creation
  formState: FormState;
  
  // Current project being created/edited
  currentProject: {
    id?: string;
    name?: string;
    googleCloudProjectId?: string;
    googleCloudProjectNumber?: string;
  } | null;
  
  // Actions for GeoJSON management
  setGeoJson: (geoJson: any) => void;
  updateGeoJsonState: (updates: Partial<GeoJsonUploadState>) => void;
  clearGeoJsonState: () => void;
  validateAndSetGeoJson: (geoJson: any) => void;
  
  // Actions for form management
  updateFormState: (updates: Partial<FormState>) => void;
  clearFormState: () => void;
  
  // Actions for current project management
  setCurrentProject: (project: ProjectCreationStore['currentProject']) => void;
  clearCurrentProject: () => void;
  
  // Reset all state
  resetAll: () => void;
  
  // Clear project creation state (for when leaving add-project page)
  clearProjectCreationState: () => void;
}

export const useProjectCreationStore = create<ProjectCreationStore>((set, get) => ({
  // Initial state
  geoJsonState: {
    mode: 'file',
    text: '',
    dragActive: false,
    error: null,
    uploadedGeoJson: null,
    validationResult: null,
  },
  
  formState: {
    isLoading: false,
    error: null,
    success: false,
  },
  
  currentProject: null,
  
  // Actions for GeoJSON management
  setGeoJson: (geoJson) => {
    console.log("ProjectCreationStore - setGeoJson called with:", geoJson);
    set(state => {
      const newState = {
        ...state,
        geoJsonState: {
          ...state.geoJsonState,
          uploadedGeoJson: geoJson,
          error: null,
        }
      };
      logStoreChange('ProjectCreationStore', 'setGeoJson', { geoJson }, newState);
      return newState;
    });
  },
  
  updateGeoJsonState: (updates) => {
    console.log("ProjectCreationStore - updateGeoJsonState called with:", updates);
    set(state => {
      const newState = {
        ...state,
        geoJsonState: { ...state.geoJsonState, ...updates }
      };
      logStoreChange('ProjectCreationStore', 'updateGeoJsonState', { updates }, newState);
      return newState;
    });
  },
  
  clearGeoJsonState: () => {
    set(state => {
      const newState = {
        ...state,
        geoJsonState: {
          mode: 'file',
          text: '',
          dragActive: false,
          error: null,
          uploadedGeoJson: null,
          validationResult: null,
        }
      };
      logStoreChange('ProjectCreationStore', 'clearGeoJsonState', {}, newState);
      return newState;
    });
  },
  
  validateAndSetGeoJson: (geoJson) => {
    console.log("ProjectCreationStore - validateAndSetGeoJson called with:", geoJson);
    
    // Simple validation - check if it's a valid GeoJSON structure
    let isValid = false;
    let error: string | null = null;
    
    if (geoJson && typeof geoJson === 'object') {
      // Check for FeatureCollection
      if (geoJson.type === 'FeatureCollection' && Array.isArray(geoJson.features)) {
        isValid = geoJson.features.length > 0;
        if (!isValid) {
          error = 'FeatureCollection must contain at least one feature';
        }
      }
      // Check for direct Polygon/MultiPolygon
      else if (geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon') {
        isValid = true;
      }
      // Check for single Feature
      else if (geoJson.type === 'Feature' && geoJson.geometry) {
        isValid = geoJson.geometry.type === 'Polygon' || geoJson.geometry.type === 'MultiPolygon';
        if (!isValid) {
          error = 'Feature must contain a Polygon or MultiPolygon geometry';
        }
      }
      else {
        error = 'Invalid GeoJSON structure. Expected FeatureCollection, Feature, Polygon, or MultiPolygon';
      }
    } else {
      error = 'GeoJSON must be a valid object';
    }
    
    set(state => {
      const newState = {
        ...state,
        geoJsonState: {
          ...state.geoJsonState,
          uploadedGeoJson: isValid ? geoJson : null,
          validationResult: {
            isValid,
            error: error || undefined,
          },
          error,
        }
      };
      logStoreChange('ProjectCreationStore', 'validateAndSetGeoJson', { geoJson, isValid, error }, newState);
      return newState;
    });
  },
  
  // Actions for form management
  updateFormState: (updates) => {
    set(state => {
      const newState = {
        ...state,
        formState: { ...state.formState, ...updates }
      };
      logStoreChange('ProjectCreationStore', 'updateFormState', { updates }, newState);
      return newState;
    });
  },
  
  clearFormState: () => {
    set(state => {
      const newState = {
        ...state,
        formState: {
          isLoading: false,
          error: null,
          success: false,
        }
      };
      logStoreChange('ProjectCreationStore', 'clearFormState', {}, newState);
      return newState;
    });
  },
  
  // Actions for current project management
  setCurrentProject: (project) => {
    set(state => {
      const newState = {
        ...state,
        currentProject: project
      };
      logStoreChange('ProjectCreationStore', 'setCurrentProject', { project }, newState);
      return newState;
    });
  },
  
  clearCurrentProject: () => {
    set(state => {
      const newState = {
        ...state,
        currentProject: null
      };
      logStoreChange('ProjectCreationStore', 'clearCurrentProject', {}, newState);
      return newState;
    });
  },
  
  // Clear project creation state (for when leaving add-project page)
  clearProjectCreationState: () => {
    set(state => {
      const newState = {
        ...state,
        geoJsonState: {
          mode: 'file',
          text: '',
          dragActive: false,
          error: null,
          uploadedGeoJson: null,
          validationResult: null,
        },
        formState: {
          isLoading: false,
          error: null,
          success: false,
        },
        // Keep currentProject as it might be used elsewhere
      };
      logStoreChange('ProjectCreationStore', 'clearProjectCreationState', {}, newState);
      return newState;
    });
  },
  
  // Reset all state
  resetAll: () => {
    set(() => {
      const newState = {
        geoJsonState: {
          mode: 'file',
          text: '',
          dragActive: false,
          error: null,
          uploadedGeoJson: null,
          validationResult: null,
        },
        formState: {
          isLoading: false,
          error: null,
          success: false,
        },
        currentProject: null,
      };
      logStoreChange('ProjectCreationStore', 'resetAll', {}, newState);
      return newState;
    });
  },
}));